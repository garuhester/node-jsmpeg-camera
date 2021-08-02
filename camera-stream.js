const WebSocket = require("ws");
const EventEmitter = require("events");
const child_process = require("child_process");
const STREAM_MAGIC_BYTES = "jsmp";

// 摄像头推流初始化
class CameraStream extends EventEmitter {
    constructor(options) {
        super(options);
        this.name = options.name;
        this.url = options.url;
        this.width = options.width;
        this.height = options.height;
        this.port = options.port;
        this.stream = void 0;

        this.stream2Socket();
    }

    stream2Socket() {
        // {rtsp:{clients:[c1,c2,c3], mpeg:''}}
        this.URL_STREAM = new URLStream();
        this.server = new WebSocket.Server({ port: this.port });
        this.server.connectionCount = 0;
        this.server.on("connection", (socket, upgradeReq) => {
            const url = upgradeReq.socket.remoteAddress + upgradeReq.url;
            console.log("new connection req url [%s]", url);
            socket.on("close", () => {
                this.server.connectionCount--;
                console.log(`%s disconnected ! `, url);
                // 检查断开连接的客户端查看的视频源是否任然有其他客户端使用，没有则关闭视频源
                this.URL_STREAM.removeNoUse();
            });

            this.server.connectionCount++;
            let streamUrl = getURLParameters(upgradeReq.url).url;

            if (!streamUrl) {
                return;
            }

            let dataCache = this.URL_STREAM.get(streamUrl);
            dataCache || (dataCache = new DataCache());
            dataCache.clients.push(socket);

            dataCache.mpeg = this.initMpeg1Muxe(streamUrl);
            this.URL_STREAM.set(streamUrl, dataCache);

            console.log("webSocket产生新的连接:%s ", url);
            // console.log(`New connection: ${this.name}`);

            // let streamHeader = Buffer.allocUnsafe(8);
            // streamHeader.write(STREAM_MAGIC_BYTES);
            // streamHeader.writeUInt16BE(this.width, 4);
            // streamHeader.writeUInt16BE(this.height, 6);
            // socket.send(streamHeader);
        });
        console.log("ws address :", this.server.address());
        this.on("camdata", (data) => {
            // console.log("camdata", this.server.clients);
            // for (const client of this.server.clients) {
            //   // console.log('camdata client', client.readyState === WebSocket.OPEN);
            //   console.log('camdata', client);
            //   if (client.readyState === WebSocket.OPEN) {
            //     data.
            //     client.send(data.data); }
            // }

            if (data.url && this.URL_STREAM.has(data.url)) {
                const clients = this.URL_STREAM.get(data.url).clients;
                clients.map(function (obj, index) {
                    if (!obj || obj.readyState !== WebSocket.OPEN) {
                        obj = null;
                        clients.splice(index, 1);
                        return;
                    }
                    obj.send(data.data);
                });
            }
        });
    }

    onSocketConnect(socket) {
        console.log("------------------------------------------------onSocketConnect");
        let streamHeader = new Buffer(8);
        streamHeader.write(STREAM_MAGIC_BYTES);
        streamHeader.writeUInt16BE(this.width, 4);
        streamHeader.writeUInt16BE(this.height, 6);
        socket.send(streamHeader, { binary: true });
        console.log(`New connection: ${this.name} - ${this.wsServer.clients.length} total`);
        return socket.on("close", function (code, message) {
            return console.log(`${this.name} disconnected - ${this.wsServer.clients.length} total`);
        });
    }

    initMpeg1Muxe(url) {
        if (this.URL_STREAM.has(url)) {
            return this.URL_STREAM.get(url).mpeg;
        }
        const ffmpegRunner = new FfmpegRunner({ url: url });
        ffmpegRunner.on("mpeg1data", (data) => {
            return this.emit("camdata", {
                url,
                data,
            });
        });

        let gettingInputData = false;
        let gettingOutputData = false;
        let inputData = [];
        let outputData = [];
        // ffmpegRunner.on('ffmpegError', (data) => {
        //   data = data.toString();
        //   if (data.indexOf('Input #') !== -1) { gettingInputData = true; }
        //   if (data.indexOf('Output #') !== -1) {
        //     gettingInputData = false;
        //     gettingOutputData = true;
        //   }
        //   if (data.indexOf('frame') === 0) { gettingOutputData = false; }
        //   if (gettingInputData) {
        //     inputData.push(data.toString());
        //     let size = data.match(/\d+x\d+/);
        //     if (size != null) {
        //       size = size[0].split('x');
        //       if (this.width == null) { this.width = parseInt(size[0], 10); }
        //       if (this.height == null) {
        //         return this.height = parseInt(size[1], 10);
        //       }
        //     }
        //   }
        // });
        ffmpegRunner.on("ffmpegError", (data) => {
            return global.process.stderr.write(data);
        });

        return ffmpegRunner;
    }

    start() {
        // this.ffmpegRunner = new FfmpegRunner({url: this.url});
        // this.ffmpegRunner.on('mpeg1data',
        //     (data) => {
        //       return this.emit('camdata', data);
        //     });
        //
        // let gettingInputData = false;
        // let gettingOutputData = false;
        // let inputData = [];
        // let outputData = [];
        // this.ffmpegRunner.on('ffmpegError', (data) => {
        //   data = data.toString();
        //   if (data.indexOf('Input #') !== -1) { gettingInputData = true; }
        //   if (data.indexOf('Output #') !== -1) {
        //     gettingInputData = false;
        //     gettingOutputData = true;
        //   }
        //   if (data.indexOf('frame') === 0) { gettingOutputData = false; }
        //   if (gettingInputData) {
        //     inputData.push(data.toString());
        //     let size = data.match(/\d+x\d+/);
        //     if (size != null) {
        //       size = size[0].split('x');
        //       if (this.width == null) { this.width = parseInt(size[0], 10); }
        //       if (this.height == null) {
        //         return this.height = parseInt(size[1], 10);
        //       }
        //     }
        //   }
        // });
        // this.ffmpegRunner.on('ffmpegError',
        //     (data) => { return global.process.stderr.write(data); });
        return this;
    }

    stop(serverCloseCallback) {
        console.log("stop");
        this.server.close(serverCloseCallback);
        this.server.removeAllListeners();
        this.server = undefined;

        this.ffmpegRunner.stop();
        this.ffmpegRunner.removeAllListeners();
        this.ffmpegRunner = undefined;
    }
}

// 客户端数据缓存
class DataCache {
    constructor() {
        this.clients = [];
        this.mpeg = null;
    }

    getReadyClients() {
        return this.clients.filter(function (client) {
            return client.readyState === WebSocket.OPEN;
        });
    }

    hasReadyClient() {
        return this.getReadyClients().length > 0;
    }

    stopStream() {
        this.mpeg.stop();
        this.mpeg.removeAllListeners();
        this.mpeg = undefined;
    }

    removeCloseClients() {
        this.clients.map(function (client, index) {
            client = null;
            this.clients.splice(index, 1);
        });
    }
}

// URL与客户端键值储存
class URLStream extends Map {
    constructor() {
        super();
    }

    // has(key) {
    //   let v = super.get(key);
    //   if (v.constructor === DataCache) {
    //     v.hasReadyClient() && v.stopStream();
    //     super.delete(key);
    //     return false;
    //   }
    //   return super.has(key);
    // }

    removeNoUse() {
        let that = this;
        this.forEach(function (value, key, map) {
            if (value.constructor === DataCache && !value.hasReadyClient()) {
                value.stopStream();
                that.delete(key);
            }
        });
    }
}

// FFMPEG启动
class FfmpegRunner extends EventEmitter {
    constructor(options) {
        super(options);
        const scale = !!options.full ? "scale=1280:720,setsar=1:1" : "scale=640:360,setsar=1:1";
        this.url = options.url;

        this.stream = child_process.spawn(
            "ffmpeg",
            [
                // '-thread_queue_size','10240',
                "-rtsp_transport",
                "tcp",
                "-i",
                this.url,
                "-f",
                "mpegts",
                "-codec:v",
                "mpeg1video",
                "-b:v",
                "1000k",
                "-bf",
                "0",
                "-vf",
                scale,
                "-codec:a",
                "mp2",
                "-r",
                "20",
                "-",
            ],
            {
                detached: false,
            }
        );

        this.inputStreamStarted = true;
        this.stream.stdout.on("data", (data) => {
            return this.emit("mpeg1data", data);
        });
        this.stream.stderr.on("data", (data) => {
            return this.emit("ffmpegError", data);
        });
        this.stream.on("close", (code) => {
            console.log(`child process exited with code ${code}`);
        });
    }

    stop() {
        this.stream.stdout.removeAllListeners();
        this.stream.stderr.removeAllListeners();
        this.stream.kill();
        this.stream = undefined;
    }
}

// 解析URL GET参数
function getURLParameters(url) {
    const params = url.match(/([^?=&]+)(=([^&]*))/g);
    return params ? params.reduce((a, v) => ((a[v.slice(0, v.indexOf("="))] = v.slice(v.indexOf("=") + 1)), a), {}) : [];
}

module.exports = CameraStream;
