requirejs.config({
    "baseUrl": "js/lib/",
    "paths": {
      "jquery": "jquery-2.0.3.min",
      "ractive": "ractive",
      "fade": "ractive-transitions-fade",
      "bootstrap": "bootstrap.min"
    },
    "shim": {
        "bootstrap": {
            deps: ['jquery'],
            exports: 'bootstrap'
        },
        "ractive": {
            exports: 'Ractive'
        }
    }
});
require([
  'jquery',
  'ractive',
  'bootstrap',
  'fade'
], function($, Ractive) {
  "use strict";

  /** @module MeterViz
    * Includes all the front-end functionalities for the MeterViz demo
    * It uses Ractive to achieve a better MCV separation; therefore, it needs a Ractive (html) template to properly work.
    * Note: by using Require.js to define the AMD module, there is no global scope poisoning,
    * and all the variables and methods stays private and safe.
    **/

  var BATTERY_SERVICE_URL =  "http://localhost:8080/battery",
      WIFI_SERVICE_URL = "http://localhost:8080/networks",
      BATTERY_CHECK_INTERVAL = 120000,          //Check battery status every 2 minutes.
      BATTERY_RED_THRESHOLD = 15,               //Percentage at which the battery goes to 'red' zone
      BATTERY_YELLOW_THRESHOLD = 55,            //Percentage at which the battery enters 'yellow' zone
      BATTERY_RED_CLASS = 'battery-red',
      BATTERY_YELLOW_CLASS = 'battery-yellow',
      BATTERY_GREEN_CLASS = 'battery-green',
      BATTERY_STATE_DISCHARGING = 'discharging',

      WIFI_CHECK_INTERVAL = 5000,       //Check wifi networks every 5 secs.
      WIFI_PROTECTED_KEY = 'Encryption key',
      WIFI_PROTECTION_ON = 'on',

      batteryUpdateTimerId = null,      //ID of the timer for battery update (so it can be paused)
      networksUpdateTimerId = null,     //ID of the timer for the wifi update function

      ractive = new Ractive({
        el: 'panels',
        template: '#meterVizTemplate',
        data: {
          batteryRedThreshold: BATTERY_RED_THRESHOLD,           //Percentage at which the battery goes to 'red' zone (export for Ractive templates)
          batteryYellowThreshold: BATTERY_YELLOW_THRESHOLD,     //Percentage at which the battery enters 'yellow' zone (export for Ractive templates)
          batteryPercent: NaN,          //The capacity of the battery, in percentage. Initially empty
          batteryLife: "",             //How much more time can the battery last?
          batteryPaused: false,         //True <=> the update daemon for the battery has been paused
          batteryUpdateError: false,    //True <=> the update daemon for the battery has reported an error at its last try
          batteryCharging: false,       //Is the battery connected to power?
          networks: [],                 //List of wifi networks retrieved
          networksPaused: false,        //True <=> the update daemon for the wifi info has been paused
          networksUpdateError: false,   //True <=> the update daemon for the wifi info has reported an error at its last try
          selectedNetworkItem: null,    //From the list of networks, which one has been selected? (DOM element)
          selectedNetwork: null,        //From the list of networks, which one has been selected? (JSON item)

                              /** @method batteryStateClass
                               *  @for MeterViz.Ractive
                               *
                               *  Return the appropriate class for the text showing the state of the battery.
                               *  @param {String} state   The current state of the battery.
                               *  @return {String} The most appropriate CSS class for the text.
                               */
          batteryStateClass:  function (state) {
                                return state === 'discharging' ? BATTERY_RED_CLASS : BATTERY_GREEN_CLASS;
          },
                              /** @method batteryLifeClass
                               *  @for MeterViz.Ractive
                               *
                               *  Return the appropriate class for the text showing the remaining time until the battery goes empty.
                               *  @param {Number} percent   The current capacity (in percentage).
                               *  @return {String} The most appropriate CSS class for the text.
                               */
          batteryLifeClass: function (percent) {
                              return percent <= BATTERY_RED_THRESHOLD ? BATTERY_RED_CLASS : (percent <= BATTERY_YELLOW_THRESHOLD ? BATTERY_YELLOW_CLASS : BATTERY_GREEN_CLASS);
          },
                              /** @method isNetworkEncrypted
                               *  @for LiteDesk.Ractive
                               *
                               *  Return true iff the network passed as parameter is protected with encryption.
                               *  @param {Object} network   The current cell item.
                               *  @return {Boolean} true iff the network is protected.
                               */
          isNetworkEncrypted: function (network) {
            return network[WIFI_PROTECTED_KEY] === WIFI_PROTECTION_ON;
          }
        }
      });

      ractive.on({
                  /** @method battery-pause
                    * @for MeterViz.Ractive
                    *
                    * In response to a click event, it pauses the daemon that looks for updates on the battery status.
                    * @return {undefined}
                    */
                  "battery-pause":  function () {
                                      clearInterval(batteryUpdateTimerId);
                                      ractive.set('batteryPaused', true);
                                      //Added a tooltip for the play/pause buttons
                                    },

                  /** @method battery-play
                    * @for MeterViz.Ractive
                    *
                    * In response to a click event, it restarts the daemon that looks for updates on the battery status.
                    * @return {undefined}
                    */
                  "battery-play":   function () {
                                      updateBatteryStatus();  //Checks the status immediately, then starts the daemon
                                      batteryUpdateTimerId = setInterval(updateBatteryStatus, BATTERY_CHECK_INTERVAL);
                                      ractive.set('batteryPaused', false);
                                    },
                  /** @method networks-pause
                    * @for MeterViz.Ractive
                    *
                    * In response to a click event, it pauses the daemon that looks for updates on the list of available networks.
                    * @return {undefined}
                    */
                  "networks-pause": function () {
                                      clearInterval(networksUpdateTimerId);
                                      ractive.set('networksPaused', true);
                                    },

                  /** @method networks-play
                    * @for MeterViz.Ractive
                    *
                    * In response to a click event, it restarts the daemon that looks for updates on the list of available networks.
                    * @return {undefined}
                    */
                  "networks-play":  function () {
                                      updateWifiNetworksList();     //Checks the status immediately, then starts the daemon
                                      networksUpdateTimerId = setInterval(updateWifiNetworksList, WIFI_CHECK_INTERVAL);
                                      ractive.set('networksPaused', false);
                                    },

                  /** @method expandWiFi
                    * @for LiteDesk.Ractive
                    *
                    * Perform a series of actions to give more info about the wifi network entry selected from the list.
                    * @param {Object} event   The Ractive wrapper for the event that triggered the function
                    * @return {undefined}
                    */
                  expandWifi:   function (event) {
                                    var selectedNetworkItem = ractive.get('selectedNetworkItem'),
                                        currentSelection = $(event.node);
                                    if (selectedNetworkItem && $.isFunction(selectedNetworkItem.toggleClass)) {
                                      selectedNetworkItem.toggleClass("active");
                                    }
                                    currentSelection.toggleClass("active");
                                    ractive.set('selectedNetworkItem', currentSelection);
                                    ractive.set('selectedNetwork', event.context);
                                }
                });


  /** @method updateBatteryStatus
    * @for MeterViz
    *
    * Starts an AJAX call to asynchronously call the server that provides info about the battery.
    * @return {undefined}
    */
  function updateBatteryStatus () {
    $.ajax(BATTERY_SERVICE_URL, {
        dataType: 'json',
        jsonp: false
      })
      .then(function (battery) {
        ractive.set('batteryUpdateError', false);
        //WARNING: this is the only place where fields from the original feed are processed.
        //          If you plan to use them elsewhere, you should make them variables, so that if
        //          the name change in the source, you only have to modify one place here.
        var batteryLife = battery.timeToEmpty,
            batteryState = battery.state;
        ractive.animate('batteryPercent', parseInt(battery.percentage, 10), {easing: 'easeOut'});
        ractive.set('batteryLife', batteryLife);
        ractive.set('batteryState', batteryState);
        ractive.set('batteryCharging', batteryState !== BATTERY_STATE_DISCHARGING);     //Is the battery discharging? //typeof(batteryLife) === 'undefined' &&

      }).fail(function () {
        ractive.set('batteryUpdateError', true);
      });
  }

  /** @method updateBatteryStatus
    * @for LiteDesk
    *
    * Starts an AJAX call to asynchronously call the server that provides info about the network status.
    * @return {undefined}
    */
  function updateWifiNetworksList () {
    $.ajax(WIFI_SERVICE_URL, {
        dataType: 'json',
        jsonp: false
      })
      .then(function (networks) {
        ractive.set('networksUpdateError', false);
        ractive.set('wifiNetworks', networks);
      }).fail(function () {
        ractive.set('networksUpdateError', true);
      });
  }

  //Start the daemons that will check the battery and networks status...
  batteryUpdateTimerId = setInterval(updateBatteryStatus, BATTERY_CHECK_INTERVAL);
  networksUpdateTimerId = setInterval(updateWifiNetworksList, WIFI_CHECK_INTERVAL);

  //... but also updates the status of battery and network immediately
  updateBatteryStatus();
  updateWifiNetworksList();

  //Adds a tooltip for the play/pause buttons, and the net-error icon
  $("[data-toggle='tooltip']").tooltip({container: $('body')});
});
