# lcwebchat

Basic web demo of chat over multicast using the librecast API.

```
 +--------------------+
 |     lcwebchat      |
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
