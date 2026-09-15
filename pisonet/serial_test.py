import serial

PORT = 'COM9'  
BAUD = 9600

ser = serial.Serial(PORT, BAUD, timeout=1)

print(f"Listening on {PORT}...")

while True:
    line = ser.readline().decode(errors='ignore').strip()

    if line:
        print(f"Received: {line}")
