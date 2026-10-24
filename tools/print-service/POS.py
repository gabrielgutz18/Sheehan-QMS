from escpos.printer import Usb

# Replace with your printer's actual hex values and endpoints
# You can find endpoints using usbview or lsusb -v
try:
    printer = Usb(
        idVendor=0x04b8,      # Replace with your Vendor ID (e.g., 0x04b8)
        idProduct=0x0202,     # Replace with your Product ID (e.g., 0x0202)
        interface=0, 
        in_ep=0x82, 
        out_ep=0x01
    )
    
    printer.text("Hello from Python USB!\n")
    printer.cut()
    print("Successfully printed to USB printer.")
    
except Exception as e:
    print(f"Could not connect to printer: {e}")