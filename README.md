# libreUM - Librecast Unified Messaging

Basic web demo of chat over multicast using the librecast API.

Live demo at: https://chat.librecast.net/ (type /help for commands)

```
 +--------------------+
 |     libreum        |
 +--------------------+
 |    librecast.js    |
 +--------------------+
           ^
           | (websocket)
           v
 +--------------------+
 |       gladd        |
 +--------------------+
 |    liblibrecast    |
 +--------------------+
    _______|________________(IPv6 multicast)
   |         |         |  
```
