/**
 * Created by jacky on 2017/2/4.
 */
'use strict';
var _ = require('lodash');
var util = require('util');
var async = require('async');
var VirtualDevice = require('./virtual-device').VirtualDevice;
var logger = require('./mlogger/mlogger');
var OPERATION_SCHEMAS = {
  save: {
    "type": "object",
    "properties": {
      "eventTag": {
        "type": "string",
        "enum": [
          "EVENT_DEV_MEBOOST_POWERON_REPORT",
          "EVENT_DEV_MEBOOST_BASIC_STATUS_REPORT",
          "EVENT_DEV_MEBOOST_POWER_REPORT",
          "EVENT_DEV_MERECEIVER_EXCEPTION_REPORT",
          "EVENT_DEV_MERECEIVER_POWERON_REPORT",
          "EVENT_DEV_MERECEIVER_BASIC_STATUS_REPORT",
          "EVENT_DEV_METHERMOSTAT_POWERON_REPORT",
          "EVENT_DEV_METHERMOSTAT_MODE_REPORT",
          "EVENT_DEV_METHERMOSTAT_SETPOINT_REPORT",
          "EVENT_CONTROL_UPDATE_NETWORK",
          "EVENT_DEV_YUEDONG_WATER_EXCEPTION_REPORT",
          "EVENT_DEV_YUEDONG_WATER_POWER_STATUS_REPORT",
          "EVENT_DEV_YUEDONG_WATER_HEATING_STATUS_REPORT",
          "EVENT_DEV_YUEDONG_WATER_HEATING_MODE_REPORT",
          "EVENT_DEV_YUEDONG_WATER_UPDATE_NETWORK"
        ]
      },
      "eventData": {
        "type": "object",
        "properties": {
          "uuid": {"type": "string"}
        },
        "required": ["uuid"]
      }
    },
    "required": ["eventTag", "eventData"]
  }
};


function EventSource(conx, uuid, token, configurator) {
  this.getDevice = function (uuid, callback) {
    var self = this;
    var msg = {
      devices: self.configurator.getConfRandom("services.device_manager"),
      payload: {
        cmdName: "getDevice",
        cmdCode: "0003",
        parameters: {
          uuid: uuid
        }
      }
    };
    self.message(msg, function (response) {
      if (response.retCode === 200) {
        var deviceInfo = response.data;
        if (util.isArray(response.data)) {
          deviceInfo = response.data[0];
        }
        callback(null, deviceInfo);
      } else {
        callback({errorId: response.retCode, errorMsg: response.description});
      }
    });
  };
  this.updateDeviceNetwork = function (uuid, eventTag, networkStatus) {
    var self = this;
    self.getDevice(uuid, function (error, deviceInfo) {
      if (!error && deviceInfo) {
        if (deviceInfo.status.network !== networkStatus) {
          self.message({
            devices: self.configurator.getConfRandom("services.device_manager"),
            payload: {
              cmdName: "deviceUpdate",
              cmdCode: "0004",
              parameters: {
                "uuid": item.uuid,
                "status.network": networkStatus
              }
            }
          }, function (response) {
            if (response.retCode !== 200) {
              logger.error(response.retCode, response.description);
            } else {
              var event = {
                userUuid: deviceInfo.userId,
                ownerUuid: deviceInfo.owner,
                deviceUuid: deviceInfo.uuid,
                deviceName: deviceInfo.name,
                deviceType: deviceInfo.type.id,
                eventTag: eventTag,
                eventLevel: 0,
                eventDescription: "device network " + networkStatus
              };
              self.message({
                devices: self.configurator.getConfRandom("services.event_center"),
                payload: {
                  cmdName: "saveEvent",
                  cmdCode: "0001",
                  parameters: event
                }
              }, function (response) {
                if (response.retCode !== 200) {
                  logger.error(response.retCode, response.description);
                }
              });
            }
          });
        }
      }
    })
  };
  VirtualDevice.call(this, conx, uuid, token, configurator);
}

util.inherits(EventSource, VirtualDevice);

/**
 * 远程RPC回调函数
 * @callback onMessage~save
 * @param {object} response:
 * {
 *      "payload":
 *      {
 *          "retCode":{string},
 *          "description":{string},
 *          "data":{object}
 *      }
 * }
 */
/**
 * 保存事件
 * @param {object} message:输入消息
 * @param {onMessage~save} peerCallback: 远程RPC回调
 * */
EventSource.prototype.save = function (message, peerCallback) {
  var self = this;
  logger.warn(message);
  var responseMessage = {retCode: 200, description: "Success.", data: {}};
  self.messageValidate(message, OPERATION_SCHEMAS.save, function (error) {
    if (error) {
      responseMessage = error;
      peerCallback(error);
    }
    else {
      async.waterfall([
          function (innerCallback) {
            self.getDevice(message.eventData.uuid, function (error, deviceInfo) {
              if (error) {
                innerCallback(error);
              }
              else {
                innerCallback(null, deviceInfo);
              }
            });
          },
          function (deviceInfo, innerCallback) {
            var event = {
              userUuid: deviceInfo.userId,
              ownerUuid: deviceInfo.owner,
              deviceUuid: deviceInfo.uuid,
              deviceName: deviceInfo.name,
              deviceType: deviceInfo.type.id,
              eventTag: message.eventTag,
              eventLevel: 0,
              eventDescription: ""
            };
            if (message.eventTag === "EVENT_DEV_MEBOOST_POWERON_REPORT") {
              event.eventDescription = "device power on";
              self.message({
                devices: self.configurator.getConfRandom("services.device_manager"),
                payload: {
                  cmdName: "deviceUpdate",
                  cmdCode: "0004",
                  parameters: {
                    "uuid": deviceInfo.uuid,
                    "status.switch": "ON"
                  }
                }
              }, function (response) {
                if (response.retCode !== 200) {
                  innerCallback({errorId: response.retCode, errorMsg: response.description});
                } else {
                  innerCallback(null, event);
                }
              });
            }
            else if (message.eventTag === "EVENT_DEV_MEBOOST_EXCEPTION_REPORT") {
              switch (message.eventData.status) {
                case 0xFFF1: {
                  event.eventDescription = "device voltage abnormal.";
                }
                  break;
                case 0xFFF2: {
                  event.eventDescription = "device current abnormal.";
                }
                  break;
                case 0xFFF3: {
                  event.eventDescription = "device power abnormal.";
                }
                  break;
                case 0xFFF4: {
                  event.eventDescription = "device temperature abnormal.";
                }
                  break;
                case 0xFFF5: {
                  event.eventDescription = "device unknown error.";
                }
                  break;
              }
              self.message({
                devices: self.configurator.getConfRandom("services.device_manager"),
                payload: {
                  cmdName: "deviceUpdate",
                  cmdCode: "0004",
                  parameters: {
                    "uuid": deviceInfo.uuid,
                    "status.switch": "ERR"
                  }
                }
              }, function (response) {
                if (response.retCode !== 200) {
                  innerCallback({errorId: response.retCode, errorMsg: response.description});
                } else {
                  innerCallback(null, event);
                }
              });
            }
            else if (message.eventTag === "EVENT_DEV_MEBOOST_BASIC_STATUS_REPORT") {
              var updateMessage = {
                devices: self.configurator.getConfRandom("services.device_manager"),
                payload: {
                  cmdName: "deviceUpdate",
                  cmdCode: "0004",
                  parameters: {
                    "uuid": deviceInfo.uuid
                  }
                }
              };
              updateMessage.payload.parameters["extra.items.mode"] = message.eventData.status;
              switch (message.eventData.status) {
                case 0x0001: {
                  updateMessage.payload.parameters["status.switch"] = "ON";
                  event.eventDescription = "Device switch into ECO mode.";
                }
                  break;
                case 0x0002: {
                  updateMessage.payload.parameters["status.switch"] = "ON";
                  event.eventDescription = "Device switch into MAN mode.";
                }
                  break;
                case 0x0003: {
                  updateMessage.payload.parameters["status.switch"] = "ON";
                  event.eventDescription = "Device heating finish.";
                }
                  break;
                case 0x0004: {
                  updateMessage.payload.parameters["status.switch"] = "OFF";
                  event.eventDescription = "Device heating off.";
                }
                  break;
                case 0x0005: {
                  updateMessage.payload.parameters["status.switch"] = "ON";
                  event.eventDescription = "device power adjusting";
                }
                  break;
                default: {
                  updateMessage.payload.parameters["status.switch"] = "ERR";
                  event.eventDescription = "device exception!";
                }
              }

              self.message(updateMessage, function (response) {
                if (response.retCode !== 200) {
                  innerCallback({errorId: response.retCode, errorMsg: response.description});
                } else {
                  innerCallback(null, event);
                }
              });
            }
            else if (message.eventTag === "EVENT_DEV_MEBOOST_POWER_REPORT") {
              self.message({
                devices: self.configurator.getConfRandom("services.device_manager"),
                payload: {
                  cmdName: "deviceUpdate",
                  cmdCode: "0004",
                  parameters: {
                    "uuid": deviceInfo.uuid,
                    "status.switch": "ON",
                    "extra.items.power": message.eventData.power
                  }
                }
              }, function (response) {
                if (response.retCode !== 200) {
                  innerCallback({errorId: response.retCode, errorMsg: response.description});
                } else {
                  innerCallback(null, event);
                }
              });
            }
            else if (message.eventTag === "EVENT_DEV_MERECEIVER_BASIC_STATUS_REPORT") {
              event.eventDescription = "device power report to " + message.eventData.status;
              var updateMsg = {
                devices: self.configurator.getConfRandom("services.device_manager"),
                payload: {
                  cmdName: "deviceUpdate",
                  cmdCode: "0004",
                  parameters: {
                    "uuid": deviceInfo.uuid,
                    "extra.items.status": message.eventData.status
                  }
                }
              };
              if ("040B09050101" === deviceInfo.type.id
                || "040B09050111" === deviceInfo.type.id
                || "040B09050201" === deviceInfo.type.id) {
                if (256 === message.eventData.status) {
                  updateMsg.payload.parameters["status.switch"] = "OFF";
                }
                else {
                  updateMsg.payload.parameters["status.switch"] = "ON";
                }
              }
              else if ("040B09050102" === deviceInfo.type.id
                || "040B09050112" === deviceInfo.type.id
                || "040B09050202" === deviceInfo.type.id) {
                if (768 === message.eventData.status) {
                  updateMsg.payload.parameters["status.switch"] = "OFF";
                }
                else {
                  updateMsg.payload.parameters["status.switch"] = "ON";
                }
              }
              else if ("040B09050103" === deviceInfo.type.id
                || "040B09050113" === deviceInfo.type.id
                || "040B09050203" === deviceInfo.type.id) {
                if (1792 === message.eventData.status) {
                  updateMsg.payload.parameters["status.switch"] = "OFF";
                }
                else {
                  updateMsg.payload.parameters["status.switch"] = "ON";
                }
              }
              self.message(updateMsg, function (response) {
                if (response.retCode !== 200) {
                  innerCallback({errorId: response.retCode, errorMsg: response.description});
                } else {
                  innerCallback(null, event);
                }
              });
            }
            else if (message.eventTag === "EVENT_CONTROL_UPDATE_NETWORK") {
              event = null;
              if (util.isArray(message.eventData.network)) {
                for (var i = 0, len = message.eventData.network.length; i < len; ++i) {
                  var item = message.eventData.network[i];
                  self.updateDeviceNetwork(item.uuid, message.eventTag, item.online ? "CONNECTED" : "DISCONNECTED");
                }
              }
              innerCallback(null, event);
            }
            else if (message.eventTag === "EVENT_DEV_YUEDONG_WATER_EXCEPTION_REPORT") {
              event.eventDescription = message.eventData.errorMSG;
              self.message({
                devices: self.configurator.getConfRandom("services.device_manager"),
                payload: {
                  cmdName: "deviceUpdate",
                  cmdCode: "0004",
                  parameters: {
                    "uuid": deviceInfo.uuid,
                    "status.switch": "ERR"
                  }
                }
              }, function (response) {
                if (response.retCode !== 200) {
                  innerCallback({errorId: response.retCode, errorMsg: response.description});
                } else {
                  innerCallback(null, event);
                }
              });
            }
            else if (message.eventTag === "EVENT_DEV_YUEDONG_WATER_POWER_STATUS_REPORT") {
              event.eventDescription = "device power " + message.eventData.power;
              innerCallback(null, event);
            }
            else if (message.eventTag === "EVENT_DEV_YUEDONG_WATER_HEATING_STATUS_REPORT") {
              if (message.eventData.status === 2) {
                event.eventDescription = "device start heating.";
              }
              else {
                event.eventDescription = "device heating off.";
              }
              innerCallback(null, event);
            }
            else if (message.eventTag === "EVENT_DEV_YUEDONG_WATER_HEATING_MODE_REPORT") {
              event.eventDescription = "device switch into " + message.eventData.heat_mode + " mode.";
              innerCallback(null, event);
            }
            else if (message.eventTag === "EVENT_DEV_YUEDONG_WATER_UPDATE_NETWORK") {
              event.eventDescription = "device " + message.eventData.network + ".";
              innerCallback(null, event);
            }

          }
        ],
        function (error, event) {
          if (error) {
            responseMessage.retCode = error.errorId;
            responseMessage.description = error.errorMsg;
          }
          else if (event) {
            self.message({
              devices: self.configurator.getConfRandom("services.event_center"),
              payload: {
                cmdName: "saveEvent",
                cmdCode: "0001",
                parameters: event
              }
            }, function (response) {
              if (response.retCode !== 200) {
                logger.error(response.retCode, response.description);
              }
            });
          }
          peerCallback(responseMessage);
        });
    }
  });
};

module.exports = {
  Service: EventSource,
  OperationSchemas: OPERATION_SCHEMAS
};