Faye.Transport = Faye.extend(Faye.Class({
  MAX_DELAY: <%= Faye::Engine::MAX_DELAY %>,
  batching:  true,

  initialize: function(client, endpoint) {
    this._client  = client;
    this.endpoint = endpoint;
    this._outbox  = [];
  },

  close: function() {},

  send: function(message, timeout) {
    this.debug('Client ? sending message to ?: ?',
               this._client._clientId, this.endpoint, message);

    if (!this.batching) return this.request([message], timeout);

    this._outbox.push(message);
    this._timeout = timeout;

    if (message.channel === Faye.Channel.HANDSHAKE)
      return this.addTimeout('publish', 0.01, this.flush, this);

    if (message.channel === Faye.Channel.CONNECT)
      this._connectMessage = message;

    if (this.shouldFlush && this.shouldFlush(this._outbox))
      return this.flush();

    this.addTimeout('publish', this.MAX_DELAY, this.flush, this);
  },

  flush: function() {
    this.removeTimeout('publish');

    if (this._outbox.length > 1 && this._connectMessage)
      this._connectMessage.advice = {timeout: 0};

    this.request(this._outbox, this._timeout);

    this._connectMessage = null;
    this._outbox = [];
  },

  receive: function(responses) {
    this.debug('Client ? received from ?: ?',
               this._client._clientId, this.endpoint, responses);

    for (var i = 0, n = responses.length; i < n; i++) {
      this._client.receiveMessage(responses[i]);
    }
  },

  retry: function(message, timeout) {
    var called = false,
        retry  = this._client.retry * 1000,
        self   = this;

    return function() {
      if (called) return;
      called = true;
      Faye.ENV.setTimeout(function() { self.request(message, timeout) }, retry);
    };
  }

}), {
  MAX_URL_LENGTH: 2048,

  get: function(client, connectionTypes, callback, context) {
    var endpoint = client.endpoint;
    if (connectionTypes === undefined) connectionTypes = this.supportedConnectionTypes();

    Faye.asyncEach(this._transports, function(pair, resume) {
      var connType     = pair[0], klass = pair[1],
          connEndpoint = client.endpoints[connType] || endpoint;

      if (Faye.indexOf(connectionTypes, connType) < 0) {
        klass.isUsable(client, connEndpoint, function() {});
        return resume();
      }

      klass.isUsable(client, connEndpoint, function(isUsable) {
        if (!isUsable) return resume();
        var transport = klass.hasOwnProperty('create') ? klass.create(client, connEndpoint) : new klass(client, connEndpoint);
        callback.call(context, transport);
      });
    }, function() {
      throw new Error('Could not find a usable connection type for ' + endpoint);
    });
  },

  register: function(type, klass) {
    this._transports.push([type, klass]);
    klass.prototype.connectionType = type;
  },

  _transports: [],

  supportedConnectionTypes: function() {
    return Faye.map(this._transports, function(pair) { return pair[0] });
  }
});

Faye.extend(Faye.Transport.prototype, Faye.Logging);
Faye.extend(Faye.Transport.prototype, Faye.Publisher);
Faye.extend(Faye.Transport.prototype, Faye.Timeouts);

