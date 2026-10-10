#uses a script to look for online printer in the system so no need to manually select for printer
import os
import usb.core
import usb.util


print("Searching for online printer please wait ...")



# Find all connected USB devices
devices = usb.core.find(find_all=True)

print("Searching for connected USB devices...")
found_printer = False

for dev in devices:
    try:
        # Get manufacturer and product string descriptors if available
        manufacturer = usb.util.get_string(dev, dev.iManufacturer) if dev.iManufacturer else "Unknown"
        product = usb.util.get_string(dev, dev.iProduct) if dev.iProduct else "Unknown"
        
        print(f"Vendor ID: {hex(dev.idVendor)} | Product ID: {hex(dev.idProduct)} | Manufacturer: {manufacturer} | Product: {product}")
        
        # Example check (replace with your printer's vendor/product ID)
        # if dev.idVendor == 0x04b8 and dev.idProduct == 0x0202:
        #     print("Target USB Printer Found!")
        #     found_printer = True
            
    except Exception as e:
        # Some devices fail to return string descriptors
        print(f"Vendor ID: {hex(dev.idVendor)} | Product ID: {hex(dev.idProduct)} | Error reading details: {e}")

if not found_printer:
    print("\nScan complete. Note your printer's Vendor ID and Product ID from the list above.")