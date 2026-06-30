import http.server
import socketserver
import json
import traceback
import os

from backend.solver.engine import analyze_beam

# Render and Railway inject a dynamic PORT env variable. 
# We default to 8000 for local development.
PORT = int(os.environ.get("PORT", 8000))

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        directory = os.path.join(os.path.dirname(__file__), 'frontend')
        super().__init__(*args, directory=directory, **kwargs)
    def end_headers(self):
        # Force browser to always fetch fresh copies of HTML/CSS/JS files
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):
        if self.path == '/api/analyze-beam':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                
                # Solve using the dedicated backend analysis module
                response_data = analyze_beam(data)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Expires', '0')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode('utf-8'))
                
            except Exception as e:
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "error",
                    "message": str(e)
                }).encode('utf-8'))
        else:
            super().do_POST()

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    pass

if __name__ == "__main__":
    # Allow quick socket reuse on restart
    socketserver.TCPServer.allow_reuse_address = True
    handler = NoCacheHTTPRequestHandler
    
    print(f"Starting server on port {PORT}...")
    # Using ThreadingTCPServer to handle requests concurrently (production-friendly)
    with ThreadingTCPServer(("", PORT), handler) as httpd:
        print(f"Server is running. Open http://localhost:{PORT} in your browser.")
        httpd.serve_forever()
