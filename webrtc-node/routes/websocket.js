var express = require('express');
var expressWs = require('express-ws');

var router = express.Router();
expressWs(router);
const clients = [];
router.ws('/:userId', function (ws, req){
    const userId = req.params.userId;
    if(!clients.includes(userId)) clients.push({
        id: userId,
        ws: ws
    });
    
    ws.on('message', function (msg) {
        const message = JSON.parse(msg);
        if(message.message.type && message.message.type === 'ping'){
            ws.send(msg)
            return;
        }
        const element = clients.find(d => d.id === message.remoteId);
        if (element) {
            element.ws.send(msg)
        }
    })
    // close 事件表示客户端断开连接时执行的回调函数
    ws.on('close', function (e) {
        console.log('close connection')
        const index = clients.findIndex(d => d.id === userId);
        if(index !== -1) clients.splice(index, 1);
    })
})

module.exports = router;