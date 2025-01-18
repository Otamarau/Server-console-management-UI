const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const rconNode = require('rcon-client');
const { exec } = require('child_process');
const fileUpload = require('express-fileupload');
const path = require('path');
const dotenv = require('dotenv').config();
const fse = require('fs-extra');
const archiver = require('archiver');


// /home/sharing
// authbind --deep forever start webserver.js
// node-sass public/styles/styles.scss public/styles/styles.css -w

// node sass should be a forever process on this device 

const app = express();
app.use(express.json());
app.use(fileUpload());
let running = false
let events = []


const hardcodedToken = 'MinecraftBitch';

// Authentication middleware with hardcoded token
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // Replace 'myhardcodedtoken' with your actual token

  if (token == null) return res.sendStatus(401); // if there's no token
  if (token !== hardcodedToken) {
    return res.sendStatus(403); // if the token is wrong
  }

  next(); // if the token is correct, proceed
}

app.post('/validate-token', (req, res) => {
  const clientToken = req.body.token;
  if (clientToken === hardcodedToken) {
    res.sendStatus(200); // OK
  } else {
    res.sendStatus(403); // Forbidden
  }
});


function updateDdns() {
  https.get('https://api.ipify.org/?format=json', (resp) => {
    let data = '';
    resp.on('data', (chunk) => {
      data += chunk;
      let jsonIp = JSON.parse(data);
      localIp = jsonIp["ip"];
    });

    resp.on('end', () => { 
      console.log("Server ip: " + localIp);
      benJuryDdns = "https://mVxLm3PImWqCU2jz:a7SkyAUUUgFgvsYw@domains.google.com/nic/update?hostname=benjury.dev&myip=" + localIp;
      otamarauDdns = "https://MdKXgXAlCac57OC9:XHWRLeobFtRHXmns@domains.google.com/nic/update?hostname=otamarau.dev&myip=" + localIp;
      https.get(benJuryDdns, (resp) => {
        let status = '';
        resp.on('data', (chunk) => {
          status += chunk;
          console.log("benjury.dev ip update : " + status);
        });
      });
      https.get(otamarauDdns, (resp) => {
        let status = '';
        resp.on('data', (chunk) => {
          status += chunk;
          console.log("otamarau.dev ip update : " + status);
        });
      });
    });

  }).on("error", (err) => {
    console.log("Error: " + err.message);
  });
}

updateDdns()


// Set the path to the Minecraft server JAR file

let serverJar = 'server.jar'
let ram = '2048M'
let serverProcess = null

// Start the Minecraft server
const startServer = () => {
  // Change the working directory to "minecraft-server"
  process.chdir(path.join(__dirname, 'minecraft-server'));

  serverProcess = exec(`java -Xmx${ram} -Xms${ram} -jar ${serverJar} nogui`);
  running = true
  events = []

  serverProcess.stdout.on('data', (data) => {
    console.log(data);
    const lines = data.toString().split('\n'); // Split the data into lines
    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine !== '') {
        const event = {
          line: trimmedLine,
        };
        events.push(event);
      }
    });
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(data);
  });

  serverProcess.on('close', (code) => {
    console.log(`Minecraft server process exited with code ${code}`);
  });

};  

const sendCommandToServer = (command) => {
  serverProcess.stdin.write(`${command}\n`);
  if (command == 'stop') {
    running = false
  }
};

// Endpoint to send commands to the minecraft server

app.post('/command/send', authenticate, (req, res) => {
  if (running) {
    const { command } = req.body;
    // Send the command to the Minecraft server
    sendCommandToServer(command);
    res.sendStatus(200);
  } else {
    res.status(503).send('Minecraft server is not running');
  }
});

// Endpoint to stream the Minecraft server data

app.get('/command/getall', authenticate, (req, res) => {
  res.set('Content-Type', 'application/json');
  res.end(JSON.stringify(events));
});

const getJarsFromDirectory = (directory) => {
  return new Promise((resolve, reject) => {
    fs.readdir(directory, (err, files) => {
      if (err) {
        console.error('Error reading directory:', err);
        reject(err);
        return;
      }
      const jars = files.filter(file => path.extname(file) === '.jar')
        .map((file, index) => ({
          fileNum: index + 1,
          filename: file
        }));
      resolve(jars);
    });
  });
};

app.get('/options/getAllJars', (req, res) => {
  const minecraftServerDir = path.join(__dirname, 'minecraft-server');

  getJarsFromDirectory(minecraftServerDir)
    .then(jars => {
      res.json(jars);
    })
    .catch(err => {
      res.status(500).send('Internal Server Error');
    });
});

app.get('/options/plugins', (req, res) => {
  const minecraftServerDir = path.join(__dirname, 'minecraft-server/plugins');

  getJarsFromDirectory(minecraftServerDir)
    .then(jars => {
      res.json(jars);
    })
    .catch(err => {
      res.status(500).send('Internal Server Error');
    });
});

app.get('/options/mods', (req, res) => {
  const minecraftServerDir = path.join(__dirname, 'minecraft-server/mods');

  getJarsFromDirectory(minecraftServerDir)
    .then(jars => {
      res.json(jars);
    })
    .catch(err => {
      res.status(500).send('Internal Server Error');
    });
});

app.post('/server/start', authenticate, (req, res) => {
  console.log(req.body["serverJar"])
  const newServerJar = req.body["serverJar"]
  const newRam = req.body["ram"]

  // Update the serverJar and ram variables if provided in the request
  serverJar = newServerJar;
  ram = newRam;
  
  if (!running) {
    console.log('Starting Minecraft server...');
    console.log('Server JAR:', serverJar);
    console.log('RAM:', ram);
    startServer();
    res.sendStatus(200);
  } else {
    res.status(503).send('Minecraft server is already running');
  }
});

// Function to upload a JAR file to the specified directory
const uploadJarToDirectory = (directory) => {
  return (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }
    // Accessing the uploaded file
    const uploadedFile = req.files.file;

    // Validate file type
    if (uploadedFile.mimetype !== 'application/java-archive') {
      return res.status(400).send('Invalid file type. Only JAR files are allowed.');
    }

    const uploadPath = path.join(directory, uploadedFile.name);

    // Move the file to the target directory
    uploadedFile.mv(uploadPath, (err) => {
      if (err) {
        return res.status(500).send(err);
      }
      res.send('File uploaded successfully!');
    });
  };
};

// Endpoint for uploading JAR files to /jar/upload
app.post('/jar/upload', authenticate, uploadJarToDirectory(path.join(__dirname, 'minecraft-server')));

// Endpoint for uploading JAR files to /mods
app.post('/jar/upload/mods', authenticate, uploadJarToDirectory(path.join(__dirname, 'minecraft-server/mods')));

// Endpoint for uploading JAR files to /plugins
app.post('/jar/upload/plugins', authenticate, uploadJarToDirectory(path.join(__dirname, 'minecraft-server/plugins')));


// Endpoint for deleting a file from the main directory
app.delete('/jar/delete/:filename', authenticate, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'minecraft-server', filename);

  deleteFile(filePath, res);
});

// Endpoint for deleting a file from /plugins
app.delete('/plugins/delete/:filename', authenticate, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'minecraft-server/plugins', filename);

  deleteFile(filePath, res);
});

// Endpoint for deleting a file from /mods
app.delete('/mods/delete/:filename', authenticate, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'minecraft-server/mods', filename);

  deleteFile(filePath, res);
});

// Function to delete a file
function deleteFile(filePath, res) {
  // Check if the file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // File doesn't exist
      return res.status(404).send('File not found.');
    }

    // Delete the file
    fs.unlink(filePath, (err) => {
      if (err) {
        return res.status(500).send(err);
      }
      res.send('File deleted successfully!');
    });
  });
}

// Function to determine file type based on extension using regex
function getFileType(filePath) {
  const match = filePath.match(/\.([0-9a-z]+)(?:[\?#]|$)/i);  // Regex to extract file extension
  if (!match) return 'unknown'; // In case there's no extension

  return match[1].toLowerCase(); // Return the file extension
}

// Rest of your listFiles function as before


const minecraftServerDir = path.join(__dirname, 'minecraft-server');



async function listFiles(dir) {
  const results = [];
  const files = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);
    const stats = await fs.promises.stat(filePath);

    if (file.isDirectory()) {
      results.push({
        name: file.name,
        type: 'directory',
        size: 'N/A',
        modified: stats.mtime.toISOString(),
        contents: await listFiles(filePath) // Recursive call for subdirectories
      });
    } else {
      const ext = getFileType(filePath);
      let content = null;

      if (ext === 'txt' || ext === 'json' || ext === 'html' || ext == 'yml' || ext == 'conf') {
        content = await fs.promises.readFile(filePath, 'utf8').catch(err => console.error(err));
      }

      results.push({
        name: file.name,
        type: ext,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        content: content  // Include file content
      });
    }
  }
  return results;
}
// Endpoint to list all files and folders in the minecraft-server directory
app.get('/listfiles/minecraft-server', authenticate, async (req, res) => {
  console.log(`Request Made For Files [${new Date()}] ${req.method} ${req.url} from ${req.connection.remoteAddress}]`);
  try {
    const files = await listFiles(minecraftServerDir);
    res.json(files);
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).send('Internal Server Error');
  }
});




function backupServerDirectory() {
  // Only send the warning and stop the server if it's running
  if (running) {
    // Send a warning message to the server
    sendCommandToServer("say Backing up server, restarting in 10 seconds...");

    // Wait 10 seconds before stopping the server to give players time to see the message
    setTimeout(() => {
      console.log('Stopping server for backup...');
      sendCommandToServer('stop');
      serverProcess.on('close', (code) => {
        console.log(`Minecraft server stopped with code ${code}, starting backup.`);
        performBackup(true); // Pass 'true' to indicate the server was running
      });
    }, 10000); // 10000 milliseconds = 10 seconds
  } else {
    // If the server isn't running, just log a message and move on to backup
    console.log('Server is not running. Proceeding with backup.');
    performBackup(false); // Pass 'false' since the server was not running
  }
}

function performBackup(wasRunning) {
  const sourceDir = path.join(__dirname, 'minecraft-server');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, 'backups');
  const destZip = path.join(backupDir, `backup-${timestamp}.zip`);

  // Ensure the backup directory exists
  fse.ensureDirSync(backupDir);

  // Create a file to stream archive data to.
  const output = fs.createWriteStream(destZip);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
  });

  output.on('close', function() {
    console.log(`Backup of server directory completed. Total bytes: ${archive.pointer()}`);
    if (wasRunning) {
      console.log('Restarting the server...');
      startServer(); // Restart the server only if it was running before the backup
    }
  });

  archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      console.warn(err);
    } else {
      throw err;
    }
  });

  archive.on('error', function(err) {
    throw err;
  });

  archive.pipe(output);
  archive.directory(sourceDir, false);
  archive.finalize();
}


// setInterval(backupServerDirectory, 43200000); // 43200000 milliseconds = 12 hour


app.get('/server/backup', authenticate, (req, res) => {
  backupServerDirectory();
  res.send('Backup initiated');
});



app.use(express.static(__dirname+'/public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname+'/public/index.html'));
});
  
https.createServer(
  {
    key: fs.readFileSync(__dirname+"/certs/private.key"),
    cert: fs.readFileSync(__dirname+"/certs/certificate.crt"),
  },
  app
)
.on('request', (req, res) => {
    if (req.url === '/') {
    console.log(`[${new Date()}] ${req.method} ${req.url} from ${req.connection.remoteAddress}`);
    }
})
.listen(443, function () {
  console.log("Server Started: https://vir-server.local/");
});

const server = http.createServer((req, res) => {
  const redirectUrl = `https://${req.headers.host}${req.url}`;
  res.writeHead(301, { Location: redirectUrl });
  res.end();
});
  
server.listen(80, () => {
  console.log('HTTP Server listening on port 80');
});

setInterval(updateDdns, 600000); 
