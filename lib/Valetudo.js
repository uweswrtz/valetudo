const DEFAULT_MAP = require("./res/default_map.json");
const Webserver = require("./webserver/WebServer");
const MqttClient = require("./MqttClient");
const Configuration = require("./Configuration");
const MapDTO = require("./dtos/MapDTO");
const Events = require("./Events");
const SSHManager = require("./SSHManager");
const Model = require("./miio/Model");
const Logger = require("./Logger");
const Viomi = require("./devices/Viomi");
const RoborockV1 = require("./devices/RoborockV1");
const RoborockS5 = require("./devices/RoborockS5");

class Valetudo {
    constructor() {
        this.configuration = new Configuration();
        this.events = new Events();

        try {
            Logger.LogLevel = this.configuration.get("logLevel");
        } catch (e) {
            Logger.error("Initialising Logger: " + e);
        }

        const modelConf = this.configuration.get("model");

        this.model = new Model({
            identifier: modelConf.type,
            embedded: modelConf.embedded,
            config: modelConf.config
        });

        this.map = new MapDTO({
            parsedData: DEFAULT_MAP
        });

        /** @type {import("./devices/MiioVacuum")} */
        this.vacuum;

        const robotArgs = {
            events: this.events,
            configuration: this.configuration,
            model: this.model
        };

        Logger.info("Starting Valetudo for Vacuum Model " + this.model.getModelIdentifier());
        Logger.info("DeviceId " + this.model.getDeviceId());
        Logger.info("IP " + this.model.getIP());
        Logger.info("CloudSecret " + this.model.getCloudSecret());
        Logger.info("LocalSecret " + this.model.getLocalSecretProvider()());

        if (MODEL_TO_IMPLEMENTATION[this.model.getModelIdentifier()]) {
            this.vacuum = new MODEL_TO_IMPLEMENTATION[this.model.getModelIdentifier()](robotArgs);
        } else {
            throw new Error("No implementation found for " + this.model.getModelIdentifier());
        }

        this.sshManager = new SSHManager();

        this.webserver = new Webserver({
            vacuum: this.vacuum,
            configuration: this.configuration,
            events: this.events,
            map: this.map,
            model: this.model,
            sshManager: this.sshManager
        });

        this.mqttClient = new MqttClient({
            configuration: this.configuration,
            vacuum: this.vacuum,
            model: this.model,
            events: this.events,
            map: this.map
        });
    }

    async shutdown() {
        Logger.info("Valetudo shutdown in progress...");

        const forceShutdownTimeout = setTimeout(() => {
            Logger.warn("Failed to shutdown valetudo in a timely manner. Using (the) force");
            process.exit(1);
        }, 5000);

        // shuts down valetudo (reverse startup sequence):
        if (this.mqttClient) {
            await this.mqttClient.shutdown();
        }
        await this.webserver.shutdown();
        await this.vacuum.shutdown();

        Logger.info("Valetudo shutdown done");
        clearTimeout(forceShutdownTimeout);
    }
}

const MODEL_TO_IMPLEMENTATION = {
    "rockrobo.vacuum.v1": RoborockV1,
    "roborock.vacuum.s5": RoborockS5,
    "viomi.vacuum.v7": Viomi
};

module.exports = Valetudo;
