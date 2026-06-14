# Campaign Photos

Place recommendation letters and campaign images in this folder.
They will be automatically loaded into the photo gallery on the campaign page.

## Supported filenames
- recommendation1.png
- recommendation2.png
- recommendation3.png
- (add more by updating the `knownImages` array in keren-shlomo-yechiel.html)

## Note
Since GitHub Pages is static (no directory listing), images must be
explicitly listed in the JavaScript. To add a new image:
1. Place the image file in this folder
2. Add the filename to the `knownImages` array in the `loadGalleryImages()` function
