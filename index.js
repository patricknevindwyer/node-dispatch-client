"use strict";

var dns = require("dns");
var os = require("os");
var Args = require("vargs").Constructor;
var request = require("request");

module.exports = {
  	 Client: class Client {
        constructor(dispatcher) {
            console.info("[dispatch-client] Starting new Dispatch client");
            console.info("[dispatch-client] Dispatcher @ %s", dispatcher);
            
            this.dispatcherURI = dispatcher.replace(/\/$/, '');
            this.heartbeatInterval = 15 * 1000;
            
        }
	    
        /*
            Registration can happend with a set of configuration options:
                
                - name (required) - Name of this service, will be used for name based lookup by Dispatcher server
                - tags (optional) - List of tags to register this service under
                - hostname (optional) - Hostname of this server
                - port (optional) - Port number of this server
                - callback (required) - Callback to trigger after registration is complete
                
             If neither the hostname or the port are specified, Dispatch Client will
             make a best guess at the hostname and port in use by the process.
        */
        register() {
            var args = new Args(arguments);
            
            if (args.length === 0) {
                // TODO: THROW EXCEPTION
                return null;
            }
                        
            // pull out all of our args
            var nonCBargs = args.all;
            
            this.name = nonCBargs[0];
            this.tags = nonCBargs[1] || [];
            this.hostname = nonCBargs[2];
            this.port = nonCBargs[3];
            
            if (this.port === undefined) {
                this.port = process.env.PORT || "3000";
            }
            
            
            
            if (this.hostname === undefined) {
                
                var t = this;
                var cb = args.callback;
                
                // find the real hostname/port
                this.findHostname(
                    function (err, hostname) {
                        
                        if (err) {
                            console.info("[dispatch-client] Error resolving hostname: %s", err);
                            cb(err);
                        }
                        else {
                            console.info("[dispatch-client] Auto-discovered identity as [%s:%s]", hostname, t.port);
                            t.hostname = hostname;
                            t._register(cb);
                        }
                    }
                )
            }
            else {
                console.info("[dispatch-client] Identifying as [%s:%s]", this.hostname, this.port);
                this._register(args.callback);    
            }
            
        }
        
        _register(cb) {
            var t = this;
            
            request.put(
                {	
                    uri: this.dispatcherURI + "/register", 
                    body: {
                        service: this.name,
                        endpoint: this.hostname + ":" + this.port,
                        tags: this.tags
                    },
                    json: true
                },
                function (err, data) {
                    
                    if (err) {
                        console.error("[dispatch-client] Error in registration: %s", err);
                        cb(err);
                    }
                    else {
                        if (data.statusCode == 200) {
                            t.uuid = data.body.uuid;
                            
                            console.log("[dispatch-client] Registered as [%s]", data.body.uuid);
                            setInterval(t.serviceHeartbeat.bind(t), t.heartbeatInterval);
                            t.setupDeregister();
                            
                            cb(null,t);
                        }
                        else {
                            console.error("[dispatch-client] register error: %s", err);
                            console.error("[dispatch-client] register data: %s", JSON.stringify(data));
                            cb("Registration error");
                        }
                    }
                }
            );
        }

        // Send a heartbeat message to the dispatch service
        serviceHeartbeat() {
            request.patch(this.dispatcherURI + "/service/uuid/" + this.uuid + "/heartbeat",
            	function (err, data) {
                    if (err) {
                        console.error("[dispatch-client] Heartbeat error: %s", err);
                        console.error(data);
                    }
                    else {
                        console.info("[dispatch-client] + Dispatch heartbeat");
                    }
                }
            );
        }
        
        setupDeregister() {
            var t = this;
            
            ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
             'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
            ].forEach(
                function(element, index, array) {
                        process.on(element, t.deregister.bind(t));
                    }
            );
        }

        deregister() {
            console.info("Dispatcher caught exit");
            if (this.uuid !== "") {
                console.info("[dispatch-client] Service UUID exists, deregistering")
                request.del(this.dispatcherURI + "/service/uuid/" + this.uuid + "/",
                    function (err, data) {
                        if (err) {
                            console.error("[dispatch-client] Deregistration error: %s", err );
                            console.error(data);
                        }
                        else {
                            console.info("[dispatch-client] Deregistered from service dispatch");
                        }
                        process.exit(1);
                    }
                 );
            }
            else {
                process.exit(1);
            }
        }        
        
        findHostname(cb) {
            dns.lookup(os.hostname(), 
                function (err, add, fam) {
                    if (err) {
                        cb(err);
                    }
                    else {
                        cb(null, add);
                    }
                }
            );
        }        
      
     }   
};