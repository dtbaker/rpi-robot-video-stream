work in progress, please ignore

stream video data to `-f mp4 tcp://localhost:9999` once server.js is running.

these flags generate a video stream that plays fine in chrome:

```
ffmpeg -re -i SOMETHING.mp4 -framerate 25 -video_size 640x480  -vcodec libx264 -profile:v main -g 25 -r 25 -b:v 500k -keyint_min 250 -strict experimental -pix_fmt yuv420p -movflags empty_moov+default_base_moof -an -preset ultrafast -f mp4 tcp://localhost:9999
```
