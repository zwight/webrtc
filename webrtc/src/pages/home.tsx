import React, { useEffect, useState } from 'react';

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },  // 无需密码的
        // { urls: "stun:zwight.cn:3478" },
        // {   
        //     urls: 'turn:zwight.cn:3478',
        //     username:"admin",
        //     credential:"123456"
        // }
    ],
};
const userId = Math.ceil(Math.random()*10000);
const wsUrl = 'wss://webrtc.zwight.cn/wss/websocket/' + userId;
// const wsUrl = 'ws://localhost:5555/wss/websocket/' + userId;
let localVideo: any;
let remoteVideo: any;
let peerConnection: any;
let socket = new WebSocket(wsUrl);
// 本地流
let localStream: any;

const HomeComponent = (props: any) => {
    const [connected, setConnected] = useState(false);
    const [remoteId, setRemoteId] = useState('');
    const [lockReconnect, setLockReconnect] = useState(false)

    /**
     * 建立连接
     */
    const requestConnect = () => {
        if(!remoteId){
            alert('请输入对方ID')
            return false;
        }
        if(!socket){
            alert('请先打开websocket')
            return false;
        }
        //准备连接
        startHandle().then(() => {
            //发送给远端开启请求
            socket.send(JSON.stringify({ 'userId': userId, 'remoteId': remoteId, 'message': {'type': 'connect'}}))
        })
    }
     //开启本地的媒体设备
    const startHandle = async () =>  {
        // 1.获取本地音视频流
        // 调用 getUserMedia API 获取音视频流
        let constraints = {
            video: true,
            // audio: {
            //     // 设置回音消除
            //     noiseSuppression: true,
            //     // 设置降噪
            //     echoCancellation: true,
            // }
            audio: true
        }

        await navigator.mediaDevices.getUserMedia(constraints)
            .then(gotLocalMediaStream)
            .catch((err) => {
                console.log('getUserMedia 错误', err);
                //创建点对点连接对象
            });

        createConnection();
    }
    // getUserMedia 获得流后，将音视频流展示并保存到 localStream
    const gotLocalMediaStream = (mediaStream: MediaStream) => {
        console.log('MediaStream', mediaStream)
        console.log(mediaStream.getVideoTracks())
        localVideo.srcObject = mediaStream;
        localStream = mediaStream;
    }

    const createConnection = () => {
        peerConnection = new RTCPeerConnection(config)

        if (localStream) {
            // 视频轨道
            const videoTracks = localStream.getVideoTracks();
            // 音频轨道
            const audioTracks = localStream.getAudioTracks();
            // 判断视频轨道是否有值
            if (videoTracks.length > 0) {
                console.log(`使用的设备为: ${videoTracks[0].label}.`);
            }
            // 判断音频轨道是否有值
            if (audioTracks.length > 0) {
                console.log(`使用的设备为: ${audioTracks[0].label}.`);
            }

            localStream.getTracks().forEach((track:any) => {
                peerConnection.addTrack(track, localStream)
            })
        }

        // 监听返回的 Candidate
        peerConnection.addEventListener('icecandidate', handleConnection);
        // 监听 ICE 状态变化
        peerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange)
        //拿到流的时候调用
        peerConnection.addEventListener('track', gotRemoteMediaStream);
    }

    // 3.端与端建立连接
    const handleConnection = (event:any) =>  {
        // 获取到触发 icecandidate 事件的 RTCPeerConnection 对象
        // 获取到具体的Candidate
        console.log("handleConnection", event)
        const icecandidate = event.candidate;

        if (icecandidate) {

            socket.send(JSON.stringify({
                'userId': userId,
                'remoteId': remoteId,
                'message': {
                    type: 'icecandidate',
                    icecandidate: icecandidate
                }
            }));
        }
    }

    // 4.显示远端媒体流
    const gotRemoteMediaStream = (event: any) => {
        console.log('remote 开始接受远端流', event)

        if (event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    }

    const handleConnectionChange = (event: any) =>  {
        const peerConnection = event.target;
        console.log('ICE state change event: ', event);
        console.log(`ICE state: ${peerConnection.iceConnectionState}.`);
    }
    const startWebsocket = () => {
        //连接成功
        socket.onopen = (e: any) => {
            console.log('连接服务器成功!')
            heartCheck.restart();      //心跳检测重置
        };
        //server端请求关闭
        socket.onclose = (e: any) => {
            console.log('close', e)
            reconnect(wsUrl);
        };
        //error
        socket.onerror = (e: any) => {
            console.error('error', e)
            reconnect(wsUrl);
        };
        socket.onmessage = onmessage
    }


    const onmessage = (e: any) =>  {
        heartCheck.restart();      //拿到任何消息都说明当前连接是正常的

        const json = JSON.parse(e.data)
        const description = json.message;
        console.log('message', json)
        if(description.type === 'ping') return;

        setRemoteId(json.userId)
        const remoteId = json.userId;
        
        switch (description.type) {
            case 'connect':
                // eslint-disable-next-line no-restricted-globals
                if(confirm(remoteId + '请求连接!')){
                    //准备连接
                    startHandle().then(() => {
                        socket.send(JSON.stringify({ 'userId': userId, 'remoteId': remoteId, 'message': {'type': 'start'} }));
                    })
                }
                break;
            case 'start':
                //同意连接之后开始连接
                startConnection(remoteId)
                break;
            case 'offer':
                peerConnection.setRemoteDescription(new RTCSessionDescription(description)).catch((err: any) => {
                    console.log('local 设置远端描述信息错误', err);
                });
                peerConnection.createAnswer().then((answer: any) => {
                    peerConnection.setLocalDescription(answer).then(() => {
                        console.log('设置本地answer成功!');
                    }).catch((err: any) => {
                        console.error('设置本地answer失败', err);
                    });
                    socket.send(JSON.stringify({ 'userId': userId, 'remoteId': remoteId, 'message': answer }));
                }).catch((e: any) => {
                    console.error(e)
                });
                break;
            case 'icecandidate':
                // 创建 RTCIceCandidate 对象
                let newIceCandidate = new RTCIceCandidate(description.icecandidate);

                // 将本地获得的 Candidate 添加到远端的 RTCPeerConnection 对象中
                peerConnection.addIceCandidate(newIceCandidate).then(() => {
                    console.log(`addIceCandidate 成功`);
                }).catch((error: any) => {
                    console.log(`addIceCandidate 错误:\n${error.toString()}.`);
                });
                break;
            case 'answer':

                peerConnection.setRemoteDescription(new RTCSessionDescription(description)).then(() => {
                    console.log('设置remote answer成功!');
                }).catch((err: any) => {
                    console.log('设置remote answer错误', err);
                });
                break;
            default:
                break;
        }
    }

    //创建发起方会话描述对象（createOffer），设置本地SDP（setLocalDescription），并通过信令服务器发送到对等端，以启动与远程对等端的新WebRTC连接。
    const startConnection = (remoteId: any) => {
        setConnected(true);
        // 发送offer
        peerConnection.createOffer().then((description: any) => {
            console.log(`本地创建offer返回的sdp:\n${description.sdp}`)
            // 将 offer 保存到本地
            peerConnection.setLocalDescription(description).then(() => {
                console.log('local 设置本地描述信息成功');
                // 本地设置描述并将它发送给远端
                socket.send(JSON.stringify({ 'userId': userId, 'remoteId': remoteId, 'message': description }));
            }).catch((err: any) => {
                console.log('local 设置本地描述信息错误', err)
            });
        }).catch((err: any) => {
            console.log('createdOffer 错误', err);
        });
    }

    /**
     * 断开连接
     */
    const hangupHandle = () => {
        // 关闭连接并设置为空
        peerConnection.close();
        peerConnection = null;
        setConnected(false);
        localStream.getTracks().forEach((track: any) => {
            track.stop()
        })
    }

    const changeInput = (e: any) => {
        setRemoteId(e.target.value)
    }

    const createWebSocket = (url: any) => {
        try{
            if('WebSocket' in window){
                socket = new WebSocket(url);
            }
        }catch(e){
            reconnect(url);
            console.log(e);
        }     
    }

    const reconnect = (url: any) => {
        if(lockReconnect) return;
        setLockReconnect(true)
        setTimeout(() => {     //没连接上会一直重连，设置延迟避免请求过多
            createWebSocket(url);
            setLockReconnect(false)
        }, 2000);
    }

    //心跳检测
    var heartCheck = {
        timeout: 50000,        //50s发一次心跳
        timeoutObj: setTimeout(() => { }, 0),
        restart: function(){
            if (this.timeoutObj) clearTimeout(this.timeoutObj);
            this.timeoutObj = setTimeout(function(){
                //这里发送一个心跳，后端收到后，返回一个心跳消息，
                //onmessage拿到返回的心跳就说明连接正常
                socket.send(JSON.stringify({ 'userId': userId, 'remoteId': remoteId, 'message': {'type': 'ping'} }));
            }, this.timeout)
        }
    }

    useEffect(() => {
        startWebsocket();
    })

    return <div>
        <h3>我的ID: {userId}</h3>
        <div className='video-list'>
            <video muted ref={el => localVideo = el} autoPlay={true}/>
            <video muted ref={el => remoteVideo = el} autoPlay={true}/>
        </div>
        <input value={remoteId} onChange={(e) => {changeInput(e)}} />
        <div className='button-group'>
            <button disabled={connected} onClick={requestConnect}>建立连接</button>
            <button disabled={!connected} onClick={hangupHandle}>断开连接</button>
        </div>
    </div>
}

export default HomeComponent;