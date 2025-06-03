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
  styleUrl: './driver-performance.component.scss'
})
export class DriverPerformanceComponent implements OnInit {
  drivers: Driver[] = [];
  selectedDriver: Driver | null = null;
  isUploading = false;
  uploadProgress = 0;
  uploadSuccess = false;
  uploadError = '';
  performanceImages: any[] = [];
  isLoading = true;
  
  // New batch upload functionality
  batchImages: { file: File, preview: string, comment: string, id: string }[] = [];
  batchComments: { comment: string, id: string }[] = [];
  currentImageComment = '';
  currentStandaloneComment = '';
  
  // Paste functionality
  isDragOver = false;
  
  // New properties for image comment editing
  editingImageComment: { [key: string]: boolean } = {};
  imageComments: { [key: string]: string } = {};
  savingImageComment: { [key: string]: boolean } = {};

  // Performance view tracking properties
  performanceViewTracking: any[] = [];
  isLoadingTracking = false;

  constructor(
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    await this.loadDrivers();
    this.isLoading = false;
    
    // Load tracking data on component initialization
    await this.loadPerformanceViewTracking();
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
      // Clear batch data when switching drivers
      this.clearBatchData();
    } else {
      this.selectedDriver = null;
      this.performanceImages = [];
      this.clearBatchData();
    }
  }

  clearBatchData(): void {
    this.batchImages = [];
    this.batchComments = [];
    this.currentImageComment = '';
    this.currentStandaloneComment = '';
  }

  // New methods for batch image handling
  onFileSelected(event: any): void {
    const files = event.target.files;
    if (files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        this.addImageToBatch(files[i]);
      }
      // Reset the input
      event.target.value = '';
    }
  }

  addImageToBatch(file: File): void {
    if (!file.type.startsWith('image/')) {
      this.uploadError = 'Please select only image files';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const batchImage = {
        file: file,
        preview: e.target?.result as string,
        comment: '',
        id: this.generateUniqueId()
      };
      this.batchImages.push(batchImage);
    };
    reader.readAsDataURL(file);
  }

  // Paste functionality for batch
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    
    const items = event.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          this.handlePastedImage(blob);
        }
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
      for (let i = 0; i < event.dataTransfer.files.length; i++) {
        const file = event.dataTransfer.files[i];
        if (file.type.indexOf('image') !== -1) {
          this.addImageToBatch(file);
        }
      }
    }
  }
  
  handlePastedImage(blob: File): void {
    const timestamp = new Date().getTime();
    const fileExt = blob.type.split('/')[1] || 'png';
    const fileName = `pasted_image_${timestamp}.${fileExt}`;
    
    const renamedFile = new File([blob], fileName, { type: blob.type });
    this.addImageToBatch(renamedFile);
  }

  removeImageFromBatch(imageId: string): void {
    this.batchImages = this.batchImages.filter(img => img.id !== imageId);
  }

  addStandaloneComment(): void {
    if (this.currentStandaloneComment.trim()) {
      const comment = {
        comment: this.currentStandaloneComment.trim(),
        id: this.generateUniqueId()
      };
      this.batchComments.push(comment);
      this.currentStandaloneComment = '';
    }
  }

  removeStandaloneComment(commentId: string): void {
    this.batchComments = this.batchComments.filter(c => c.id !== commentId);
  }

  generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // New batch save method
  async saveBatchContent(): Promise<void> {
    if (!this.selectedDriver) {
      this.uploadError = 'Please select a driver';
      return;
    }

    const hasImages = this.batchImages.length > 0;
    const hasComments = this.batchComments.length > 0;

    if (!hasImages && !hasComments) {
      this.uploadError = 'Please add images or comments to save';
      return;
    }

    this.isUploading = true;
    this.uploadProgress = 0;
    this.uploadSuccess = false;
    this.uploadError = '';

    try {
      let uploadedCount = 0;
      const totalItems = this.batchImages.length + this.batchComments.length;

      // Upload images with their comments
      for (const batchImage of this.batchImages) {
        const timestamp = new Date().getTime() + uploadedCount; // Ensure unique timestamps
        const fileExt = batchImage.file.name.split('.').pop() || 'png';
        const fileName = `performance_${timestamp}.${fileExt}`;
        const filePath = `${this.selectedDriver.id}/${fileName}`;

        const { error: uploadError } = await this.supabaseService.getSupabase()
          .storage
          .from('driver-performance')
          .upload(filePath, batchImage.file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Error uploading image:', uploadError);
          this.uploadError = `Upload failed for image: ${uploadError.message}`;
          return;
        }

        // Save comment for this image if provided
        if (batchImage.comment.trim()) {
          await this.savePerformanceComments(
            this.selectedDriver.id, 
            filePath, 
            fileName, 
            batchImage.comment.trim()
          );
        }

        uploadedCount++;
        this.uploadProgress = Math.round((uploadedCount / totalItems) * 100);
      }

      // Save standalone comments
      for (const standaloneComment of this.batchComments) {
        const timestamp = new Date().getTime() + uploadedCount;
        const commentPath = `general_comment_${timestamp}`;
        
        const { error: commentError } = await this.supabaseService.getSupabase()
          .from('driver_performance_comments')
          .insert([{
            driver_id: this.selectedDriver.id,
            image_path: commentPath,
            image_name: `General Comment ${new Date().toLocaleDateString()}`,
            comments: standaloneComment.comment,
            created_by: 'Admin'
          }]);

        if (commentError) {
          console.error('Error saving standalone comment:', commentError);
          this.uploadError = `Error saving comment: ${commentError.message}`;
          return;
        }

        uploadedCount++;
        this.uploadProgress = Math.round((uploadedCount / totalItems) * 100);
      }

      // Success - clear batch data and reload
      this.uploadSuccess = true;
      this.clearBatchData();
      
      // Reload images if driver is selected
      if (this.selectedDriver) {
        await this.loadDriverPerformanceImages(this.selectedDriver.id);
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        this.uploadSuccess = false;
      }, 3000);

    } catch (error: any) {
      this.uploadError = `Error saving performance content: ${error.message || error}`;
      console.error('Exception saving performance content:', error);
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
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
          this.uploadError = `Error deleting image: ${error.message}`;
        } else {
          // Reload images after deletion
          await this.loadDriverPerformanceImages(this.selectedDriver.id);
          this.uploadSuccess = true;
          setTimeout(() => {
            this.uploadSuccess = false;
          }, 3000);
        }
      } catch (error: any) {
        console.error('Exception deleting performance image:', error);
        this.uploadError = `Error deleting image: ${error.message || error}`;
      }
    }
  }

  startEditingImageComment(imageName: string): void {
    this.editingImageComment[imageName] = true;
  }

  cancelEditingImageComment(imageName: string): void {
    this.editingImageComment[imageName] = false;
    // Reset to original comment
    const originalImage = this.performanceImages.find(img => img.name === imageName);
    if (originalImage) {
      this.imageComments[imageName] = originalImage.comment || '';
    }
  }

  async saveImageComment(imageName: string): Promise<void> {
    if (!this.selectedDriver) return;
    
    this.savingImageComment[imageName] = true;
    
    try {
      const comment = this.imageComments[imageName]?.trim() || '';
      const filePath = `${this.selectedDriver.id}/${imageName}`;
      
      if (comment) {
        // Check if comment already exists
        const { data: existingComments } = await this.supabaseService.getSupabase()
          .from('driver_performance_comments')
          .select('*')
          .eq('driver_id', this.selectedDriver.id)
          .eq('image_name', imageName);
        
        if (existingComments && existingComments.length > 0) {
          // Update existing comment
          const { error } = await this.supabaseService.getSupabase()
            .from('driver_performance_comments')
            .update({
              comments: comment,
              created_by: 'Admin',
              created_at: new Date().toISOString()
            })
            .eq('driver_id', this.selectedDriver.id)
            .eq('image_name', imageName);
            
          if (error) {
            console.error('Error updating image comment:', error);
            this.uploadError = `Error updating comment: ${error.message}`;
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
              comments: comment,
              created_by: 'Admin'
            }]);
            
          if (error) {
            console.error('Error saving image comment:', error);
            this.uploadError = `Error saving comment: ${error.message}`;
            return;
          }
        }
        
        // Update local data
        const imageIndex = this.performanceImages.findIndex(img => img.name === imageName);
        if (imageIndex !== -1) {
          this.performanceImages[imageIndex].comment = comment;
          this.performanceImages[imageIndex].comment_created_by = 'Admin';
          this.performanceImages[imageIndex].comment_created_at = new Date().toISOString();
        }
      }
      
      this.editingImageComment[imageName] = false;
      this.uploadSuccess = true;
      setTimeout(() => {
        this.uploadSuccess = false;
      }, 3000);
      
    } catch (error: any) {
      console.error('Exception saving image comment:', error);
      this.uploadError = `Error saving comment: ${error.message || error}`;
    } finally {
      this.savingImageComment[imageName] = false;
    }
  }

  async deleteImageComment(imageName: string): Promise<void> {
    if (!this.selectedDriver) return;
    
    if (confirm('Are you sure you want to delete this comment?')) {
      this.savingImageComment[imageName] = true;
      
      try {
        const { error } = await this.supabaseService.getSupabase()
          .from('driver_performance_comments')
          .delete()
          .eq('driver_id', this.selectedDriver.id)
          .eq('image_name', imageName);
          
        if (error) {
          console.error('Error deleting image comment:', error);
          this.uploadError = `Error deleting comment: ${error.message}`;
        } else {
          // Update local data
          const imageIndex = this.performanceImages.findIndex(img => img.name === imageName);
          if (imageIndex !== -1) {
            this.performanceImages[imageIndex].comment = '';
            this.performanceImages[imageIndex].comment_created_by = '';
            this.performanceImages[imageIndex].comment_created_at = '';
          }
          
          this.imageComments[imageName] = '';
          this.editingImageComment[imageName] = false;
          
          this.uploadSuccess = true;
          setTimeout(() => {
            this.uploadSuccess = false;
          }, 3000);
        }
      } catch (error: any) {
        console.error('Exception deleting image comment:', error);
        this.uploadError = `Error deleting comment: ${error.message || error}`;
      } finally {
        this.savingImageComment[imageName] = false;
      }
    }
  }

  async loadPerformanceViewTracking(): Promise<void> {
    this.isLoadingTracking = true;
    
    try {
      // Get all drivers first
      const { data: drivers, error: driversError } = await this.supabaseService.getSupabase()
        .from('drivers')
        .select('*')
        .order('name');
      
      if (driversError) {
        console.error('Error loading drivers for tracking:', driversError);
        this.performanceViewTracking = [];
        return;
      }

      // Process each driver to determine their view status
      const trackingPromises = drivers.map(async (driver) => {
        // Get the most recent view record for this driver
        const { data: viewData } = await this.supabaseService.getSupabase()
          .from('driver_performance_views')
          .select('*')
          .eq('driver_id', driver.id)
          .order('viewed_at', { ascending: false })
          .limit(1);

        // Get performance images for this driver
        const { data: imagesData } = await this.supabaseService.getSupabase()
          .storage
          .from('driver-performance')
          .list(`${driver.id}`);

        const lastView = viewData && viewData.length > 0 ? viewData[0] : null;
        const imageFiles = imagesData ? imagesData.filter(file => file.name !== '.keep') : [];
        const imageCount = imageFiles.length;

        // If no images, driver doesn't need to be tracked
        if (imageCount === 0) {
          return null;
        }

        // Find the most recent image upload time
        const mostRecentImageTime = imageFiles.reduce((latest, file) => {
          const fileTime = new Date(file.created_at || file.updated_at || 0).getTime();
          return fileTime > latest ? fileTime : latest;
        }, 0);

        // Determine if driver has unviewed notifications
        let hasUnviewedNotifications = false;
        
        if (!lastView) {
          // Never viewed but has images = unviewed notifications
          hasUnviewedNotifications = true;
          console.log(`Driver ${driver.name}: Never viewed, has ${imageCount} images - UNVIEWED`);
        } else {
          // Check if last view was before the most recent image
          const lastViewTime = new Date(lastView.viewed_at).getTime();
          hasUnviewedNotifications = lastViewTime < mostRecentImageTime;
          
          console.log(`Driver ${driver.name}: Last viewed at ${new Date(lastViewTime).toISOString()}, most recent image at ${new Date(mostRecentImageTime).toISOString()} - ${hasUnviewedNotifications ? 'UNVIEWED' : 'UP TO DATE'}`);
        }

        // Only include drivers with unviewed notifications
        if (!hasUnviewedNotifications) {
          return null;
        }

        return {
          driverId: driver.id,
          driverName: driver.name,
          driverCustomId: driver.custom_id,
          performanceImageCount: imageCount,
          lastViewedAt: lastView ? lastView.viewed_at : null,
          hasViewed: !!lastView,
          mostRecentImageTime: mostRecentImageTime,
          hasUnviewedNotifications: true
        };
      });

      const allTrackingData = await Promise.all(trackingPromises);
      
      // Filter out null values (drivers with no unviewed notifications)
      this.performanceViewTracking = allTrackingData.filter(data => data !== null);
      
    } catch (error) {
      console.error('Exception loading performance view tracking:', error);
      this.performanceViewTracking = [];
    } finally {
      this.isLoadingTracking = false;
    }
  }

  getViewedCount(): number {
    // This now needs to calculate viewed drivers differently since we only store unviewed ones
    // We'll need to get the total driver count and subtract unviewed
    return this.drivers.length - this.performanceViewTracking.length;
  }

  getNotViewedCount(): number {
    // Now this is simply the length of our tracking array since it only contains unviewed drivers
    return this.performanceViewTracking.length;
  }

  // Getter to show only drivers who haven't viewed their performance updates
  get unviewedDriversTracking(): any[] {
    // Since performanceViewTracking now only contains unviewed drivers, just return it directly
    return this.performanceViewTracking;
  }
} 