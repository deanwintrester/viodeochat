// Initialize WebSocket and manage audio recording
function initializeAudioWebSocket() {
  // 按钮
  const startBtn = document.getElementById('chatBtn-recoding');
  const stopBtn = document.getElementById('chatBtn-stop');
  const statusDiv = document.getElementById('status');
  const timeSpan = document.getElementById('time');
  const messageInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('chatBtn');
  const clearButton = document.getElementById('chatBtn-clear');


  let audioDataBuffer = [];
  let websocket = null;

  // Open WebSocket connection
  initWebSocket();




  function initWebSocket() {
    websocket = new WebSocket('ws://localhost:8000/ws/companyculture');

    websocket.onopen = () => {
      console.log('WebSocket connection opened');
    };

    websocket.onmessage = (e) => {
      console.log('Received message from server:', e.data);
    };

    websocket.onerror = (e) => {
      console.error('WebSocket error:', e);
    };

    websocket.onclose = (e) => {
      console.log('WebSocket connection closed:', e);
    };
  }


// ************************************ 录音 **********************************************
  // Initialize recorder
  const recorder = new Recorder({
    sampleBits: 16,
    sampleRate: 16000,
    numChannels: 1,
    compiling: true
  });

  // Start recording
  startBtn.onclick = function () {
    recorder.start().then(() => {
      timeSpan.innerText = '0s';
      statusDiv.innerHTML = '';
      audioDataBuffer = []; // Clear buffer
    }).catch(error => {
      console.error('Error starting recorder:', error);
    });

    recorder.onprogress = function (params) {
      timeSpan.innerText = Math.floor(params.duration) + 's';
    };

    // Accumulate audio data during recording
    recorder.ondataavailable = function (data) {
      audioDataBuffer.push(data);
      console.log('data:', data);
    };
  };

  // Stop recording and send full audio via WebSocket
  stopBtn.onclick = function () {
    console.log('Stopping recording...');
    recorder.stop(); // 假设 stop() 不是异步的

    let NextData = recorder.getNextData();
    console.log('NextData:',NextData);

    let PCMBlob = recorder.getPCMBlob();
    console.log('Blob:',PCMBlob);
    sendAudioToBackend(PCMBlob);
    audioDataBuffer = [];
    recorder.stream.getTracks().forEach(track => track.stop());
  };

  // Send the complete audio blob via WebSocket
  function sendAudioToBackend(audioBlob) {
    const reader = new FileReader();

    reader.onload = function (event) {
      const arrayBuffer = event.target.result;
      console.log("ArrayBuffer byte length:", arrayBuffer.byteLength);

      // Send the full arrayBuffer data over WebSocket in one go
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(arrayBuffer);
        console.log('Sent full audio data to the server');
      } else {
        console.error('WebSocket is not open. Cannot send audio data.');
      }
    };

    // Read audioBlob as arrayBuffer to send it over WebSocket
    reader.readAsArrayBuffer(audioBlob);
  }

  // Send an end signal after the full audio is transmitted
  function sendEndSignal() {
    const endMessage = JSON.stringify({
      "user_id": "yq110",
      "state": "End",
    });

    if (websocket.readyState === WebSocket.OPEN) {
      websocket.send(endMessage);
      console.log('Sent end signal');
    }

    // Close WebSocket connection after the transmission is done
    websocket.close();
  }

  function escapeHtml(html) {
    let text = document.createTextNode(html);
    let div = document.createElement('div');
    div.appendChild(text);
    return div.innerHTML;
  }
  // 显示用户输入消息到窗口
  function addRequestMessage(message) {
    var chatWindow = $('#chatWindow');
    var chatInput = $('#chatInput');
    chatInput.val('');
    let escapedMessage = escapeHtml(message);  // 对请求message进行转义，防止输入的是html而被浏览器渲染
    let requestMessageElement = $('<div class="message-bubble"><span class="chat-icon request-icon"></span><div class="message-text request"><p>' +  escapedMessage + '</p></div></div>');
    chatWindow.append(requestMessageElement);
    let responseMessageElement = $('<div class="message-bubble"><span class="chat-icon response-icon"></span><div class="message-text response"><span class="loading-icon"><i class="fa fa-spinner fa-pulse fa-2x"></i></span></div></div>');
    chatWindow.append(responseMessageElement);
    chatWindow.scrollTop(chatWindow.prop('scrollHeight'));
  }

  // 显示回答信息到窗口
  function addResponseMessage(message) {

    var chatWindow = $('#chatWindow');
    let lastResponseElement = $(".message-bubble .response").last();
    let escapedMessage = escapeHtml(message)
    lastResponseElement.append(escapedMessage);
    // remove loading-ico
    lastResponseElement.find('.loading-icon').remove();
    chatWindow.scrollTop(chatWindow.prop('scrollHeight'));
  }

  // 图片信息
  let imageChunks = [];
  let totalChunks = 0;

  function addResponseImage(imageElement) {
    var chatWindow = $('#chatWindow');
    let lastResponseElement = $(".message-bubble .response").last();

    lastResponseElement.append(imageElement);
    chatWindow.scrollTop(chatWindow.prop('scrollHeight'));
  }

  function assembleImage(chunks) {
    const base64Data = chunks.join('');
    const imageElement = document.createElement('img');
    imageElement.src = 'data:image/jpeg;base64,' + base64Data;  // Assuming the image is in JPEG format
    imageElement.classList.add('message-image');
    addResponseImage(imageElement);
  }


  let audioDataQueue = []; 
  let isPlaying = false;
  function playAudio() {
    if (isPlaying || audioDataQueue.length === 0) {
        return;
    }

    const audioData = audioDataQueue.shift(); 
    const blob = new Blob([audioData], {type: 'audio/wav'}); 
    const audioURL = URL.createObjectURL(blob);
    const audioElement = new Audio();
    audioElement.src = audioURL; 

    audioElement.play();
    isPlaying = true; 

    audioElement.addEventListener('ended', function() {
        isPlaying = false;
        playAudio();
    });
  } 

  websocket.onmessage = function (event) {

    const message = event.data;

    // Parse received message as JSON
    const jsonData = JSON.parse(message);

    // *************************
    if (jsonData.type === 'image_chunk') {
      // Store image chunks and assemble when all chunks are received
      imageChunks[jsonData.index] = jsonData.content;
      if (jsonData.index === 0) totalChunks = jsonData.total_chunks;
      
      if (imageChunks.length === totalChunks && !imageChunks.includes(undefined)) {
        assembleImage(imageChunks);
        imageChunks = [];
        totalChunks = 0;
      }
    }else if (jsonData.type === 'audiodata') {
      console.log('Received audio data from server: ');
      const audioData = Uint8Array.from(atob(jsonData.content), c => c.charCodeAt(0));
      console.log('Retrieved data from server: ');
      audioDataQueue.push(audioData.buffer); 
      playAudio();
    }else if (jsonData.type === 'asr-text') {
      const asr_content = jsonData.content;
      addRequestMessage(asr_content)
    }else {
        const content = jsonData.content;
        addResponseMessage(content);
    }

    sendButton.disabled = false;
    messageInput.disabled = false;
  }


  function sendMessage(){
    sendButton.disabled = true;
    messageInput.disabled = true;
    // user_ip = getIpClient().then(user_ip => {
    //   console.log(user_ip);
    // });

    const message = messageInput.value;
    const data = {
        content: message,
        user: "yq111",
        type: "Doc",
    };
    
    if (message.trim() !== '') {
      addRequestMessage(message)
      // Convert data to JSON string
      const jsonData = JSON.stringify(data);
      
      // Send JSON string to the server
      websocket.send(jsonData);

      // Clear the message input field
      messageInput.value = '';
     
    }else{
      sendButton.disabled = false;
      messageInput.disabled = false;
    }
  }

  sendButton.onclick = sendMessage;
  messageInput.addEventListener('keydown', function(event){
    if (event.key === "Enter" && !event.shiftKey){

      event.preventDefault();
      sendButton.disabled = true;
      messageInput.disabled = true;
      sendMessage();
    }
  });



  // 记忆清除
  clearButton.onclick = function (){
    const data = {
      content: '',
      user: "yq111",
      type: 0,
    };
    const jsonData = JSON.stringify(data); 
    // Send JSON string to the server
    websocket.send(jsonData);
    
    // 清除屏幕
    var chatWindow = $('#chatWindow');
    chatWindow.empty();
    $(".answer .tips").css({"display":"flex"});
    messages = [];
    localStorage.removeItem("session");


  }
}

function screenshot() {
  $(".screenshot a").click(function () {
    var chatWindow = $('#chatWindow');
    // 创建副本元素
    const clonedChatWindow = chatWindow.clone();
    clonedChatWindow.css({
      position: "absolute",
      top: "0", 
      left: "0", 
      overflow: "visible",
      width: chatWindow.width(),
      height: chatWindow[0].scrollHeight 
    });
    $("body").append(clonedChatWindow);

    html2canvas(clonedChatWindow[0], {
      useCORS: true,
      scrollY: -window.scrollY, 
    }).then(function (canvas) {
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imgData;
      link.download = "screenshot_" + Math.floor(Date.now() / 1000) + ".png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      clonedChatWindow.remove();
    });
  });
}  





window.onload = function () {
  initializeAudioWebSocket();
  screenshot();
};
