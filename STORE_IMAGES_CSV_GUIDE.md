# Store Images CSV Export/Import Guide

## Overview

This guide explains how to properly handle store images when exporting and importing store data via CSV files. The system is designed to maintain image linkage between your stores and their associated images stored in Supabase Storage.

## How Image Linkage Works

### Database Structure

1. **`stores` table**: Contains store information including an `images` column
2. **`store_images` table**: Contains image metadata and links to storage
3. **Supabase Storage**: Contains the actual image files in the `store-images` bucket

### Image Codes System

When images are uploaded to a store, the system:
1. Generates a unique image code: `IMG_[store_id_prefix]_[timestamp]`
2. Stores the image file in Supabase Storage
3. Creates a record in the `store_images` table with metadata
4. Updates the store's `images` column with the image code

## CSV Export/Import Process

### Exporting Stores with Images

1. Click the **"Export CSV"** button in the Store Library
2. The system exports all store data including the `images` column
3. The `images` column contains a JSON array of image codes: `["IMG_abc123_xyz", "IMG_def456_uvw"]`

### Importing Stores with Images

1. Click **"Import CSV"** and select your modified CSV file
2. The system validates the `images` column format
3. Image codes are stored in the database

### Image Display After Import

After importing a CSV with image codes, you'll see two types of images in the Images tab:

#### 1. **Actual Images** (with image files)
- Display the actual image thumbnail
- Show full functionality (edit, delete, set as storefront)
- These are images that exist in both the database and storage

#### 2. **Placeholder Images** (image codes only)
- Display with a dashed border and file icon
- Show the image code from the CSV
- Display message: "Image code from CSV import - actual image file not found"
- Limited functionality (info button only)

## Best Practices

### For CSV Export/Import

1. **Always backup** your data before importing
2. **Keep image codes intact** - don't modify the `images` column format
3. **Use proper JSON format**: `["code1", "code2"]` not `code1, code2`
4. **Test with a small subset** before importing large datasets

### For Image Management

1. **Upload images directly** through the admin interface when possible
2. **Use descriptive annotations** for better organization
3. **Set storefront images** to help identify stores quickly
4. **Regular cleanup** - remove unused image codes from CSV before import

## Troubleshooting

### Images Not Displaying After Import

**Problem**: You imported a CSV with image codes but don't see the actual images.

**Cause**: The image codes exist in the database but the actual image files are missing from storage.

**Solutions**:
1. **Re-upload images**: Use the upload interface to add new images
2. **Check image codes**: Verify the codes in your CSV match existing files
3. **Contact support**: If images should exist but don't display

### Invalid Images Column Format

**Problem**: Import fails with "Invalid images format" error.

**Cause**: The `images` column contains invalid JSON.

**Solutions**:
1. **Fix JSON format**: Ensure proper array format `["code1", "code2"]`
2. **Remove quotes**: Don't wrap the entire JSON in additional quotes
3. **Use empty array**: Use `[]` for stores with no images

### Placeholder Images Showing

**Problem**: Images show as placeholders with file icons instead of actual images.

**Explanation**: This is normal behavior when image codes exist but files don't.

**Actions**:
1. **Upload new images**: Use the upload interface to replace placeholders
2. **Remove codes**: Edit the CSV to remove non-existent image codes
3. **Keep for reference**: Placeholders help track what images were expected

## Technical Details

### Image Code Format
```
IMG_[store_id_prefix]_[timestamp_base36]
```
Example: `IMG_a1b2c3d4_1k2m3n4p`

### Images Column Format
```json
["IMG_a1b2c3d4_1k2m3n4p", "IMG_e5f6g7h8_5q6r7s8t"]
```

### Storage Structure
```
store-images/
├── stores/
│   ├── [store-id]/
│   │   ├── [timestamp]-[random].[ext]
│   │   └── [timestamp]-[random].[ext]
│   └── [store-id]/
│       └── [timestamp]-[random].[ext]
```

## Support

If you encounter issues with image import/export:

1. Check the browser console for error messages
2. Verify your CSV format matches the exported structure
3. Ensure image codes are properly formatted
4. Contact technical support with specific error details

---

**Note**: The placeholder image system helps maintain data integrity by showing you which image codes exist in your data even when the actual image files are missing. This prevents data loss and helps with troubleshooting. 