import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { Driver } from '../../models/driver.model';

@Component({
  selector: 'app-driver-performance',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './driver-performance.component.html',
  styleUrls: ['./driver-performance.component.scss']
})
export class DriverPerformanceComponent implements OnInit {
  drivers: Driver[] = [];
  selectedDriver: Driver | null = null;
  isUploading = false;
  selectedFile: File | null = null;
  uploadProgress = 0;
  uploadSuccess = false;
  uploadError = '';
  performanceImages: any[] = [];
  isLoading = true;
  
  // Paste functionality
  pastedImage: File | null = null;
  pastedImagePreview: string | null = null;
  isDragOver = false;
  
  // Comments functionality
  performanceComments: string = '';
  
  // New properties for image comment editing
  editingImageComment: { [key: string]: boolean } = {};
  imageComments: { [key: string]: string } = {};
  savingImageComment: { [key: string]: boolean } = {};

  constructor(
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    await this.loadDrivers();
    this.isLoading = false;
  }

  async loadDrivers(): Promise<void> {
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('drivers')
        .select('*')
        .order('name');
      
      if (error) {
        console.error('Error loading drivers:', error);
        return;
      }
      
      this.drivers = data || [];
    } catch (error) {
      console.error('Exception loading drivers:', error);
    }
  }

  onDriverSelect(event: any): void {
    const driverId = event.target.value;
    if (driverId) {
      this.selectedDriver = this.drivers.find(d => d.id === driverId) || null;
      this.loadDriverPerformanceImages(driverId);
    } else {
      this.selectedDriver = null;
      this.performanceImages = [];
    }
  }

  async loadDriverPerformanceImages(driverId: string): Promise<void> {
    try {
      this.isLoading = true;
      // List files for this driver
      const { data, error } = await this.supabaseService.getSupabase()
        .storage
        .from('driver-performance')
        .list(`${driverId}`);
      
      if (error) {
        console.error('Error loading performance images:', error);
        this.performanceImages = [];
        this.isLoading = false;
        return;
      }

      // Generate URLs for the images and load their comments
      this.performanceImages = await Promise.all((data || []).map(async (file: any) => {
        const { data: urlData } = await this.supabaseService.getSupabase()
          .storage
          .from('driver-performance')
          .createSignedUrl(`${driverId}/${file.name}`, 60 * 60 * 24); // 24 hour signed URL
        
        // Load existing comments for this image
        const { data: commentsData } = await this.supabaseService.getSupabase()
          .from('driver_performance_comments')
          .select('*')
          .eq('driver_id', driverId)
          .eq('image_name', file.name)
          .order('created_at', { ascending: false })
          .limit(1);
        
        const imageComment = commentsData && commentsData.length > 0 ? commentsData[0] : null;
        
        // Initialize editing states for this image
        this.editingImageComment[file.name] = false;
        this.imageComments[file.name] = imageComment?.comments || '';
        this.savingImageComment[file.name] = false;
        
        return {
          name: file.name,
          url: urlData?.signedUrl || '',
          created_at: file.created_at,
          comment: imageComment?.comments || '',
          comment_created_by: imageComment?.created_by || '',
          comment_created_at: imageComment?.created_at || ''
        };
      }));

      // Sort by most recent first
      this.performanceImages.sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } catch (error) {
      console.error('Exception loading performance images:', error);
      this.performanceImages = [];
    } finally {
      this.isLoading = false;
    }
  }

  onFileSelected(event: any): void {
    const files = event.target.files;
    if (files.length > 0) {
      this.selectedFile = files[0];
    }
  }

  // New methods for clipboard paste functionality
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    
    const items = event.clipboardData?.items;
    if (!items) return;
    
    // Find the first image item in the clipboard
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          this.handlePastedImage(blob);
        }
        break;
      }
    }
  }
  
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }
  
  onDragLeave(): void {
    this.isDragOver = false;
  }
  
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    
    if (event.dataTransfer?.files.length) {
      const file = event.dataTransfer.files[0];
      if (file.type.indexOf('image') !== -1) {
        this.handlePastedImage(file);
      }
    }
  }
  
  handlePastedImage(blob: File): void {
    // Create a unique file name for the pasted image
    const timestamp = new Date().getTime();
    const fileExt = blob.type.split('/')[1] || 'png';
    const fileName = `pasted_image_${timestamp}.${fileExt}`;
    
    // Create a File object from the Blob with a proper name
    this.pastedImage = new File([blob], fileName, { type: blob.type });
    
    // Create preview URL
    this.pastedImagePreview = URL.createObjectURL(blob);
  }
  
  clearPastedImage(): void {
    if (this.pastedImagePreview) {
      URL.revokeObjectURL(this.pastedImagePreview);
    }
    this.pastedImage = null;
    this.pastedImagePreview = null;
  }
  
  async uploadPastedImage(): Promise<void> {
    if (!this.pastedImage || !this.selectedDriver) {
      this.uploadError = 'Please select a driver and paste an image';
      return;
    }
    
    this.isUploading = true;
    this.uploadProgress = 0;
    this.uploadSuccess = false;
    this.uploadError = '';
    
    try {
      // Generate file path
      const timestamp = new Date().getTime();
      const fileExt = this.pastedImage.name.split('.').pop() || 'png';
      const fileName = `performance_${timestamp}.${fileExt}`;
      const filePath = `${this.selectedDriver.id}/${fileName}`;

      // Upload to Supabase
      const { data, error } = await this.supabaseService.getSupabase()
        .storage
        .from('driver-performance')
        .upload(filePath, this.pastedImage, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        this.uploadError = `Upload failed: ${error.message}`;
        console.error('Error uploading pasted image:', error);
      } else {
        // Save comments if provided
        if (this.performanceComments.trim()) {
          await this.savePerformanceComments(this.selectedDriver.id, filePath, fileName, this.performanceComments.trim());
        }
        
        this.uploadSuccess = true;
        
        // Clear the paste area and comments
        this.clearPastedImage();
        this.performanceComments = '';
        
        // Reload images
        await this.loadDriverPerformanceImages(this.selectedDriver.id);
      }
    } catch (error: any) {
      this.uploadError = `Upload failed: ${error.message || error}`;
      console.error('Exception uploading pasted image:', error);
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
    }
  }

  async uploadPerformanceImage(): Promise<void> {
    if (!this.selectedFile || !this.selectedDriver) {
      this.uploadError = 'Please select a driver and an image file';
      return;
    }

    this.isUploading = true;
    this.uploadProgress = 0;
    this.uploadSuccess = false;
    this.uploadError = '';

    try {
      // Generate a unique file name with timestamp
      const timestamp = new Date().getTime();
      const fileExt = this.selectedFile.name.split('.').pop();
      const fileName = `performance_${timestamp}.${fileExt}`;
      const filePath = `${this.selectedDriver.id}/${fileName}`;

      const { data, error } = await this.supabaseService.getSupabase()
        .storage
        .from('driver-performance')
        .upload(filePath, this.selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        this.uploadError = `Upload failed: ${error.message}`;
        console.error('Error uploading performance image:', error);
      } else {
        // Save comments if provided
        if (this.performanceComments.trim()) {
          await this.savePerformanceComments(this.selectedDriver.id, filePath, fileName, this.performanceComments.trim());
        }
        
        this.uploadSuccess = true;
        this.selectedFile = null;
        this.performanceComments = '';
        
        // Reset file input
        const fileInput = document.getElementById('performanceImage') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
        // Reload images
        await this.loadDriverPerformanceImages(this.selectedDriver.id);
      }
    } catch (error: any) {
      this.uploadError = `Upload failed: ${error.message || error}`;
      console.error('Exception uploading performance image:', error);
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
    }
  }

  async savePerformanceComments(driverId: string, imagePath: string, imageName: string, comments: string): Promise<void> {
    try {
      const { data, error } = await this.supabaseService.getSupabase()
        .from('driver_performance_comments')
        .insert([
          {
            driver_id: driverId,
            image_path: imagePath,
            image_name: imageName,
            comments: comments,
            created_by: 'Admin' // You can modify this to get the actual admin name
          }
        ]);

      if (error) {
        console.error('Error saving performance comments:', error);
        // Don't throw error here as the image upload was successful
      } else {
        console.log('Performance comments saved successfully');
      }
    } catch (error) {
      console.error('Exception saving performance comments:', error);
      // Don't throw error here as the image upload was successful
    }
  }

  async saveStandaloneComment(): Promise<void> {
    console.log('saveStandaloneComment called');
    console.log('selectedDriver:', this.selectedDriver);
    console.log('performanceComments:', this.performanceComments);
    console.log('performanceComments.trim():', this.performanceComments.trim());
    
    if (!this.selectedDriver || !this.performanceComments.trim()) {
      this.uploadError = 'Please select a driver and add a comment';
      console.log('Validation failed:', { 
        selectedDriver: !!this.selectedDriver, 
        hasComments: !!this.performanceComments.trim(),
        commentsLength: this.performanceComments.length
      });
      return;
    }

    try {
      this.isUploading = true;
      this.uploadError = '';
      this.uploadSuccess = false;
      
      console.log('Attempting to save standalone comment...');
      
      // Create a general comment entry (without specific image)
      const timestamp = new Date().getTime();
      const commentPath = `general_comment_${timestamp}`;
      
      const commentData = {
        driver_id: this.selectedDriver.id,
        image_path: commentPath,
        image_name: `General Comment ${new Date().toLocaleDateString()}`,
        comments: this.performanceComments.trim(),
        created_by: 'Admin'
      };
      
      console.log('Comment data to insert:', commentData);
      
      const { data, error } = await this.supabaseService.getSupabase()
        .from('driver_performance_comments')
        .insert([commentData]);

      console.log('Supabase response:', { data, error });

      if (error) {
        this.uploadError = `Error saving comment: ${error.message}`;
        console.error('Error saving standalone comment:', error);
      } else {
        console.log('Comment saved successfully!');
        this.uploadSuccess = true;
        this.performanceComments = '';
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          this.uploadSuccess = false;
        }, 3000);
      }
    } catch (error: any) {
      this.uploadError = `Error saving comment: ${error.message || error}`;
      console.error('Exception saving standalone comment:', error);
    } finally {
      this.isUploading = false;
    }
  }

  async deletePerformanceImage(fileName: string): Promise<void> {
    if (!this.selectedDriver) return;
    
    if (confirm('Are you sure you want to delete this performance image?')) {
      try {
        const filePath = `${this.selectedDriver.id}/${fileName}`;
        const { error } = await this.supabaseService.getSupabase()
          .storage
          .from('driver-performance')
          .remove([filePath]);
        
        if (error) {
          console.error('Error deleting performance image:', error);
          alert('Failed to delete the image');
        } else {
          // Reload images
          await this.loadDriverPerformanceImages(this.selectedDriver.id);
        }
      } catch (error) {
        console.error('Exception deleting performance image:', error);
        alert('Failed to delete the image');
      }
    }
  }

  // New methods for managing image comments
  startEditingImageComment(imageName: string): void {
    this.editingImageComment[imageName] = true;
  }

  cancelEditingImageComment(imageName: string): void {
    this.editingImageComment[imageName] = false;
    // Reset to original comment
    const image = this.performanceImages.find(img => img.name === imageName);
    if (image) {
      this.imageComments[imageName] = image.comment;
    }
  }

  async saveImageComment(imageName: string): Promise<void> {
    if (!this.selectedDriver) return;
    
    this.savingImageComment[imageName] = true;
    const filePath = `${this.selectedDriver.id}/${imageName}`;
    const comments = this.imageComments[imageName].trim();

    try {
      if (comments) {
        // Save or update comment
        const { data: existingComment } = await this.supabaseService.getSupabase()
          .from('driver_performance_comments')
          .select('id')
          .eq('driver_id', this.selectedDriver.id)
          .eq('image_name', imageName)
          .limit(1);

        if (existingComment && existingComment.length > 0) {
          // Update existing comment
          const { error } = await this.supabaseService.getSupabase()
            .from('driver_performance_comments')
            .update({
              comments: comments,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingComment[0].id);

          if (error) {
            console.error('Error updating image comment:', error);
            this.uploadError = `Failed to update comment: ${error.message}`;
            return;
          }
        } else {
          // Create new comment
          const { error } = await this.supabaseService.getSupabase()
            .from('driver_performance_comments')
            .insert([{
              driver_id: this.selectedDriver.id,
              image_path: filePath,
              image_name: imageName,
              comments: comments,
              created_by: 'Admin'
            }]);

          if (error) {
            console.error('Error saving image comment:', error);
            this.uploadError = `Failed to save comment: ${error.message}`;
            return;
          }
        }
      } else {
        // Delete comment if empty
        const { error } = await this.supabaseService.getSupabase()
          .from('driver_performance_comments')
          .delete()
          .eq('driver_id', this.selectedDriver.id)
          .eq('image_name', imageName);

        if (error) {
          console.error('Error deleting image comment:', error);
          this.uploadError = `Failed to delete comment: ${error.message}`;
          return;
        }
      }

      // Update the image object with new comment
      const image = this.performanceImages.find(img => img.name === imageName);
      if (image) {
        image.comment = comments;
        image.comment_created_by = comments ? 'Admin' : '';
        image.comment_created_at = comments ? new Date().toISOString() : '';
      }

      this.editingImageComment[imageName] = false;
      this.uploadSuccess = true;
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        this.uploadSuccess = false;
      }, 3000);
      
    } catch (error: any) {
      console.error('Exception saving image comment:', error);
      this.uploadError = `Failed to save comment: ${error.message || error}`;
    } finally {
      this.savingImageComment[imageName] = false;
    }
  }

  async deleteImageComment(imageName: string): Promise<void> {
    if (!this.selectedDriver) return;
    
    if (confirm('Are you sure you want to delete this comment?')) {
      try {
        const { error } = await this.supabaseService.getSupabase()
          .from('driver_performance_comments')
          .delete()
          .eq('driver_id', this.selectedDriver.id)
          .eq('image_name', imageName);

        if (error) {
          console.error('Error deleting image comment:', error);
          this.uploadError = `Failed to delete comment: ${error.message}`;
          return;
        }

        // Update the image object
        const image = this.performanceImages.find(img => img.name === imageName);
        if (image) {
          image.comment = '';
          image.comment_created_by = '';
          image.comment_created_at = '';
        }
        
        // Reset form state
        this.imageComments[imageName] = '';
        this.editingImageComment[imageName] = false;
        
        this.uploadSuccess = true;
        setTimeout(() => {
          this.uploadSuccess = false;
        }, 3000);
        
      } catch (error: any) {
        console.error('Exception deleting image comment:', error);
        this.uploadError = `Failed to delete comment: ${error.message || error}`;
      }
    }
  }
} 