
import os
import usb.core
import usb.util


print("Searching for online printer please wait ...")


devices = usb.core.find(find_all=True)

print("Searching for connected USB devices...")
found_printer = False

for dev in devices:
    try:
    
        manufacturer = usb.util.get_string(dev, dev.iManufacturer) if dev.iManufacturer else "Unknown"
        product = usb.util.get_string(dev, dev.iProduct) if dev.iProduct else "Unknown"
        
        print(f"Vendor ID: {hex(dev.idVendor)} | Product ID: {hex(dev.idProduct)} | Manufacturer: {manufacturer} | Product: {product}")
        
      
    except Exception as e:
    
        print(f"Vendor ID: {hex(dev.idVendor)} | Product ID: {hex(dev.idProduct)} | Error reading details: {e}")

if not found_printer:
    print("\nScan complete. Note your printer's Vendor ID and Product ID from the list above.")