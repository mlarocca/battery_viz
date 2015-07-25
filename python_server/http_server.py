#!/usr/bin/env python

from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
from json import dumps
from sys import argv
from urlparse import urlparse, parse_qs
from re import compile, match
import os

#Regular expressions for battery and networks paths. We are building a RESTful API, so URL's path will matter
#For battery info, the acceptable patterns are '/battery' and all the ones starting with '/battery/'
RE_BATTERY = compile(r'/battery/?')

#Feeds' folder
FILE_BATTERY = os.sep + 'data' + os.sep + 'battery.txt'

#Script's folder
FILE_PATH =  '{0}{1}..{1}'.format(os.path.dirname(os.path.abspath(__file__)), os.sep) 



class BatteryRequestHandler(BaseHTTPRequestHandler):
    #protocol_version = "HTTP/1.1"

    def __extract_query_params(self):
        """ Extracts query parameters from the request URL
            : return : A dictionary with key-value pairs; parse_qs returns values as list of strings
        """
        query = urlparse(self.path).query
        return parse_qs(query)


    def do_GET(self):
        """ Handle GET requests to the server
        """
        if self.path.endswith('.ico'):
            #just ignore request from browsers for icons
            return      

        path = urlparse(self.path).path

        #Routes the URLs, according to the designed RESTful interface
        if match(RE_BATTERY, path):
            try:
                battery_file = os.popen('upower -i /org/freedesktop/UPower/devices/battery_BAT0 | grep -E "state|time to empty|to\ full|percentage"')

                battery = {}
                for line in battery_file:
                    line = line.strip() #removes leading and ending spacing, and newlines
                    if len(line) > 0:   
                        try:
                            #If the line isn't empty
                            key, val = line.split(":")
                            #Just stores the key-value association, so that coupling with client is reduced to the min:
                            #   values will be eamined only on the client side
                            battery[key.strip()] = val.strip()
                        except ValueError:
                            pass

                battery_file.close()    #don't forget to close the file once done
                
                #send code 200 response
                self.send_response(200)
                body  = dumps(battery)
                #send header first
                self.send_header('Access-Control-Allow-Origin','*')
                self.send_header('Content-type','application/json')
                self.send_header('Content-Length', len(body))
                self.end_headers()

                #send file content to client
                self.wfile.write(body)
                return
                
            except IOError:
                self.send_error(404, 'Unable to retrieve battery status')

        else:
            try:
                f = open(os.curdir + os.sep + self.path, 'r') 

                self.send_response(200)
                self.end_headers()
                self.wfile.write(f.read())
                f.close()
                return

            except IOError:
                self.send_error(404,'File Not Found: %s' % self.path)


def run():
    """ Starts one instance of the server.

    """
    print('http server is starting...')

    #Change current directory
    os.chdir(FILE_PATH)
    
    #by default http server port is 8080...
    port = 8080
    if len(argv) > 1:
        try:
            #...unless it is passed as an argument
            port = int(argv[1])
        except ValueError:
            pass

    #ip and port of servr
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, BatteryRequestHandler)
    print('http server is running on port %d' % port)
    httpd.serve_forever()
    
if __name__ == '__main__':
    run()