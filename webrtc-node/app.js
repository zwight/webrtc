var express = require('express');
var expressWs = require('express-ws');
var websocket=require('./routes/websocket');

var app = express();
expressWs(app);

app.use('/wss/websocket', websocket);

app.listen('5555', function () {
    console.log("服务开启了");
});