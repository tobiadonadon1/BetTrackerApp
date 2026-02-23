from PIL import Image
import numpy as np

def remove_background(input_path, output_path, tolerance=30):
    """
    Remove dark background from logo, keep only the stylized B.
    """
    # Open image
    img = Image.open(input_path).convert('RGBA')
    data = np.array(img)
    
    # Get RGB channels
    r, g, b, a = data.T
    
    # Define dark background colors (the dark blue/gray background)
    # Based on the logo, the background is dark with RGB around (10-50, 20-60, 40-80)
    # The B itself is lighter/brighter colors
    
    # Calculate brightness
    brightness = (r.astype(int) + g.astype(int) + b.astype(int)) / 3
    
    # Dark pixels (background) - make them transparent
    # Also check if pixel is in the dark blue range
    dark_mask = (
        (r < 80) & (g < 100) & (b < 120) &  # Dark colors
        (brightness < 100)  # Overall dark
    )
    
    # Very dark pixels (definitely background)
    very_dark = brightness < 60
    
    # Combine masks
    background_mask = dark_mask | very_dark
    
    # Set alpha to 0 for background pixels
    data[..., 3][background_mask.T] = 0
    
    # Create new image
    result = Image.fromarray(data)
    
    # Save
    result.save(output_path)
    print(f"Saved to {output_path}")
    return result

if __name__ == "__main__":
    input_file = "/Users/tobiadonadon/Desktop/BetTrackerApp/assets/new_logo.png"
    output_file = "/Users/tobiadonadon/Desktop/BetTrackerApp/assets/new_logo.png"
    
    remove_background(input_file, output_file)
    print("Logo background removed!")
