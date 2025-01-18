

function requestToken() {
  const userToken = window.prompt('Please enter your access token:');
  if (userToken) {
    validateToken(userToken);
  } else {
    window.alert('No token provided, access denied.');
  }
}

function setCookie(name, value, days) {
  var expires = "";
  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + (days*24*60*60*1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}


function validateToken(token) {
  fetch('/validate-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token: token })
  })
  .then(response => {
    if (response.ok) {
      setCookie('userToken', token, 30); // Store the token in a cookie for 30 days
      console.log('Token validated and stored as a cookie.');
    } else {
      throw new Error('Invalid token');
    }
  })
  .catch(error => {
    console.error('Token validation error:', error);
    window.alert('Invalid token. Please enter a valid token.');
    requestToken(); 
  });
}

function getCookie(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(';');
  for(var i=0;i < ca.length;i++) {
    var c = ca[i];
    while (c.charAt(0)==' ') c = c.substring(1,c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
  }
  return null;
}



function fetchWithToken(endpoint, options) {
  const token = getCookie('userToken'); // Retrieve the token from cookies
  if (!token) {
    requestToken(); // No token, request before proceeding
    return Promise.reject('No token provided');
  }

  // Add the token to the request headers
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };

  return fetch(endpoint, options); // Proceed with the fetch request
}

function eraseCookie(name) {   
  document.cookie = name+'=; Max-Age=-99999999;';  
}


function sendCommand() {
  let commandInput = document.querySelector('#input');
  let command = { command: commandInput.value };
  commandInput.value = "";

  fetchWithToken('/command/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  })
  .then(response => {
    if (response.ok) {
      console.log('Command sent successfully: ' + command.command);
    } else {
      console.error('Error occurred while sending the command');
      window.alert('Error: Is the server running?');
    }
  })
  .catch(error => {
    console.error('Error occurred:', error);
    window.alert('Error: Is the server running?');
  });
}

function stopServer() {
  let commandInput = 'stop';
  let command = { command: commandInput };
  fetchWithToken('/command/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  })
    .then(response => {
      if (response.ok) {
        console.log('Command sent successfully: ' + command.command );
        window.alert('Stopping Server')
      } else {
        console.error('Error occurred while sending the command');
      }
    })
    .catch(error => {
      console.error('Error occurred:', error);
  });
}

function startServer() {
  const ramInput = document.querySelector('#ram').value;
  const serverJarInput = document.querySelector('#serverJar').value;
  
  fetchWithToken('/server/start', {
    method: 'POST',
    body: JSON.stringify({ ram : ramInput, serverJar : serverJarInput}),
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then((response) => {
    if (!response.ok) {
      window.alert("Error starting the server. Is the server already running?");
      throw new Error('Failed to start the Minecraft server');
    }
    console.log('Minecraft server started successfully');
    window.alert('Starting Server');
  })
  .catch((error) => {
    console.error(error);
  });
}

function loadTerm() {
  const eventsElement = document.querySelector('#events');
  let newHtml = '';
  fetchWithToken('/command/getall', { method: 'GET' })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Minecraft server is not running or access is denied');
      }
      return response.json();
    })
    .then((data) => {
      events.innerHTML = '';
      data.forEach(event => {
        const stampRegex = /\[[\d]+:[\d]+:[\d]+ [A-Z]+\]/;
        const modifiedLine = event.line.replace(stampRegex, `<div class="stamp">$&</div>`);
        newHtml += `<div class="row">${modifiedLine}</div>`;
      });
      events.innerHTML = newHtml;

      // Automatically scroll to the bottom of the terminal
      events.scrollTop = events.scrollHeight;
    })
    .catch((error) => {
      console.error('Error:', error);
      eventsElement.innerHTML = '<div class="error">Error loading data. See console for details.</div>';
    });
}

function backup() {
  fetchWithToken('/server/backup', { method: 'GET' })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Unable to Backup or access is denied');
      }
      return response.text(); // Assuming the response is just a text message
    })
    .then((text) => {
      console.log(text); // Log the successful backup message
      window.alert(text); // Corrected typo here
      // You can also update the UI to inform the user that the backup was initiated
    })
    .catch((error) => {
      console.error('Error:', error);
      window.alert(error.message); // Corrected typo and show only the error message
      // Update the UI to inform the user that the backup failed
    });
}



function uploadFile(type) {
  let fileInput;
  let uploadEndpoint;

  if (type === 'jar') {
    fileInput = document.getElementById('jarFileInput');
    uploadEndpoint = '/jar/upload';
  } else if (type === 'mod') {
    fileInput = document.getElementById('modFileInput');
    uploadEndpoint = '/jar/upload/mods';
  } else if (type === 'plugin') {
    fileInput = document.getElementById('pluginFileInput');
    uploadEndpoint = '/jar/upload/plugins';
  } else {
    alert('Invalid file type.');
    return;
  }

  const file = fileInput.files[0];
  if (!file) {
    alert('Please select a file.');
    return;
  }

  const allowedFileType = 'application/java-archive';
  if (file.type !== allowedFileType) {
    alert('Please select a JAR file.');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  fetchWithToken(uploadEndpoint, {
    method: 'POST',
    body: formData
  })
  .then(response => response.text())
  .then(message => {
    window.alert(message);
    fileInput.value = ''; // Clear the file input field
    // Additional logic specific to plugins or mods, if needed
    listJars();
  })
  .catch(error => {
    console.error('Error:', error);
    alert('An error occurred while uploading the file.');
  });
}

function listJars() {
  const serverJar = document.querySelector("#serverJar");
  const plugins = document.querySelector("#plugins");
  const mods = document.querySelector("#mods");

  serverJar.innerHTML = '';
  plugins.innerHTML = '';
  mods.innerHTML = '';

  fetch('/options/getAllJars') 
  .then((response) => {
    if (!response.ok) {
      throw new Error('Error getting jars');
    }
    return response.json();
  })
  .then((data) => {
    data.forEach(jar => {
      serverJar.innerHTML += `<option value="${jar["filename"]}">${jar["filename"]}</option>`;
    })
  });
  fetch('/options/plugins')
  .then((response) => {
    if (!response.ok) {
      throw new Error('Error getting plugins');
    }
    return response.json();
  })
  .then((data) => {
    data.forEach(plugin => {
      plugins.innerHTML += `<option value="${plugin["filename"]}">${plugin["filename"]}</option>`;
    });
  });
  fetch('/options/mods')
  .then((response) => {
    if (!response.ok) {
      throw new Error('Error getting mods');
    }
    return response.json();
  })
  .then((data) => {
    data.forEach(mod => {
      mods.innerHTML += `<option value="${mod["filename"]}">${mod["filename"]}</option>`;
    });
  });
}

function removeFile(type) {
  let fileName;
  let endpoint;

  if (type === 'jar') {
    fileName = document.querySelector('#serverJar').value;
    endpoint = '/jar/delete';
  } else if (type === 'plugin') {
    fileName = document.querySelector('#plugins').value;
    endpoint = '/plugins/delete';
  } else if (type === 'mod') {
    fileName = document.querySelector('#mods').value;
    endpoint = '/mods/delete';
  } else {
    console.log('Invalid file type');
    return;
  }

  fetch(`${endpoint}/${fileName}`, {
    method: 'DELETE'
  })
  .then(response => {
    if (response.ok) {
      console.log('File deleted successfully!');
      window.alert('Successfully removed');
      listJars();
      // Perform any additional actions or display a success message
    } else {
      console.log('Error deleting file:', response.statusText);
      // Handle the error or display an error message
    }
  })
  .catch(error => {
    console.log('Error:', error);
    // Handle the error or display an error message
  });
}

function loadFilesModal(state) {
  if (state == true) {
    document.querySelector('#filesModal').style.display = 'flex';
    document.querySelector('#overlay').style.display = 'flex';
  } else {
    document.querySelector('#filesModal').style.display = 'none';
    document.querySelector('#overlay').style.display = 'none';
  }
}

let serverFiles;

function fetchServerFiles() {
  fetchWithToken('/listfiles/minecraft-server', { method: 'GET' })
  .then((response) => {
    if (!response.ok) {
      throw new Error('Unable to list or access is denied');
    }
    return response.json();  // Parse the response as JSON
  })
  .then((files) => {

    serverFiles = files;

    console.log(files);

    const filesContainer = document.getElementById('files');
    filesContainer.innerHTML = '';  // Clear existing content

    // Iterate over the files and create HTML for each
    let i = 1;
    files.forEach((file) => {
      const row =  `
        <div class=row id="${i}" onclick="openFile(${i})">
          <div class="fileInfo"><h1>${file.name}</h1></div>
          <div class="fileInfo"><h1>${file.modified}</h1></div>
          <div class="fileInfo"><h1>${file.type}</h1></div>
          <div class="fileInfo"><h1>${formatFileSize(file.size)}</h1></div>
          <div class="fileInfo"><button class="stop">Delete</button>></div>
        </div>
      `
      filesContainer.innerHTML += row;
      i++;
    });
  })
  .catch((error) => {
    console.error('Error:', error);
    window.alert(error.message);
  });
}


let lastBordered = null;

function openFile(file) {

  if (lastBordered != null) {
    lastBordered.style.border = "#191919 1px solid";
  } 
  const row = document.getElementById(file);
  row.style.border = "white 1px dashed";

  
  if (lastBordered == row) {



  }
  lastBordered = row;
}



function formatFileSize(size) {
  if (size === 'N/A') return size; // Return as is for directories
  // Convert size to a more readable format (e.g., KB, MB, GB)
  // This is a simple implementation; you can improve it based on your requirements
  if (size < 1024) return size + ' B';
  if (size < 1048576) return (size / 1024).toFixed(2) + ' KB';
  if (size < 1073741824) return (size / 1048576).toFixed(2) + ' MB';
  return (size / 1073741824).toFixed(2) + ' GB';
}

fetchServerFiles();


listJars()
  
// Call loadTerm() initially
loadTerm();
// Call loadTerm() every 3 seconds (3000 milliseconds)
setInterval(loadTerm, 3000);


