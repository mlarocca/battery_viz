#Battery + WiFi viz
===================

A web application to get and report info about the status of the battery and 
of the available wifi networks.

To run the example, you need nodejs and Python 2.7 installed on your system.

* Please open a terminal window, browse to the root folder for the project, and run _'node server'_: this will start a local server (on port 8080) that serves static content for the client part of the application;

* Then open a second window, browse to the root folder for the project, then to the 'server' subfolder and run _'sudo python http_server.py 9999'_: this will start a local server for the backend of the application - The port used by the server can be set as last parameter, but it's 9999 by default, and 9999 is the port used on the client part. It's important to run it as super user, otherwise iwlist won't have the priviledges needed (it didn't seem right to run sudo iwlist in a non-interacting program!).

* The application will be accessible at the address localhost:8080//

It could have been possible to use the same server for the static content as well, but I thought that it would have been a more realistic choice to have them separated, since usually, to scale better, you use a dedicated server (or even better a CDN) to serve static content. This time as well, since updates needs to be frequent (every 5 secs max), this solution avoid jamming the dynamic server.

##Details of the implementation

The Python server is handcrafted for this purpose and it uses the _BaseHTTPRequestHandler_ class: since the task was easy, I thought it wouldn't be worth using a heavy framework, and instead it could be better to have a lightweight solution.

To retrieve the battery state, I used the following bash command (executed through python's os.popen method)

`upower -i /org/freedesktop/UPower/devices/battery_BAT0 | grep -E "state|time to empty|to\ full|percentage"`

To retrieve the wifi networks, instead:

`iwlist wlan0 scanning | egrep 'Cell |Address|Channel|Frequency|Encryption|Quality|Signal level|Last beacon|Mode|Group Cipher|Pairwise Ciphers|Authentication Suites|ESSID'`

For the client part, I used several libraries:

* jQuery 2,

* Bootstrap,

* RequireJs, to create a clean design with AMD modules,

* Ractive

In particular, Ractive allows a better conformity to MCV pattern, with a strongest separation between View (demo.html) and Controller (demo.js).

I tried to reduce coupling between server and client at a minimum, delegating data manipulation to the client as much as possible (to have modifications needed only at one place); for the battery it was easy, while for the networks least, unfortunately, the particular structure of the data forced me to preprocess the data on the server, in order to pass it as json. The alternative could have been passing the text as it was to the client, and parsing it on the client only, but that would have slown down the client, especially with such frequent requests (WebWorkers could have done the trick, by the way relieving the server from some work, which could help scaling in a real situation).

##UI

The UI is divided in three panels;

1. Shows the state of the battery;

2. Shows the list of available WiFi networks;

3. [Initially hidden] When a network in the list is selected, shows the details about that network.

At the top right corner of the first two panels there is a button that allows users to pause and resume the daemons that checks the battery and the networks. It is also a shortcut to avoid waiting 'till the next time the daemon would run, since they are fired every time they are resumed.

At the top left corner of the same panels, an icon is shown if the last time the daemon tried to check the status, it was unable to reach the server, or it had an error response.

The battery indicator will show both graphically and textually the charge left (in percentage), plus two icons:

1. A warning icon when charge goes below 15%
2. An icon indicating whether the power chord is plugged in, and the battery is charging.

Below the graphic indicator, it is shown the state of the battery (charging/discharging) and the time left before it depletes all the charge (it changes color when charge goes below 55% and 15%).


The networks panel shows a list of the wifi networks scanned by iwlist. Only wlan0 is scanned (a refined version could check if different interfaces are available).
For each network retrieved, only the name (ESSID) and MAC address of the network are shown, plus an icon if the network is protected with encryption. If users click on any of the items in the list, the details for that networks are shown in the third panel.

##Development

To develop this project, I followed the same path I usually take with data-driven applications:

* First, I created a client, designing the workflow of the app and refining the AJAX calls, using mock json files for the data.
* The second step was to create a mock http server, which responded to requests from the client by reading data from text files; the text files were filled with data consistent with the system calls that will be made to retrieve live data, so that the parsing methods could be written and used in the final version.
* The last step, was to create an http server that read the data from the actual system calls.

Developed and tested on Ubuntu 14.04
