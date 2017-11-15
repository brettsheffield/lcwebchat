# libreUM - Librecast Unified Messaging

Basic web demo of chat over multicast using the librecast API.

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
