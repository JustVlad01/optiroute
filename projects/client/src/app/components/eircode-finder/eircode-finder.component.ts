import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-eircode-finder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule],
  templateUrl: './eircode-finder.component.html',
  styleUrls: ['./eircode-finder.component.scss']
})
export class EircodeFinderComponent {
  eircode: string = '';
  isLoading: boolean = false;
  addressData: any = null;
  error: string | null = null;
  copySuccess: { [key: string]: boolean } = {};
  
  constructor(private http: HttpClient) {}

  searchEircode(): void {
    if (!this.eircode.trim()) {
      this.error = 'Please enter an Eircode';
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.addressData = null;

    // Note: In a real application, you would use your own API key and proper endpoint
    // This is a simplified example - replace with actual API
    const formattedEircode = this.eircode.replace(/\s/g, '');
    
    // Using a free Eircode lookup service - in production, use a proper API
    this.http.get(`https://api.getthedata.com/eircode/${formattedEircode}`)
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          if (response.status === 'match') {
            this.addressData = response.address;
          } else {
            this.error = 'No address found for this Eircode';
          }
        },
        error: (err) => {
          this.isLoading = false;
          this.error = 'Error looking up Eircode. Please try again.';
          console.error('Eircode lookup error:', err);
        }
      });
  }

  copyToClipboard(text: string, field: string): void {
    navigator.clipboard.writeText(text).then(() => {
      // Reset all copy success flags
      Object.keys(this.copySuccess).forEach(key => {
        this.copySuccess[key] = false;
      });
      
      // Set success for the current field
      this.copySuccess[field] = true;
      
      // Reset after 2 seconds
      setTimeout(() => {
        this.copySuccess[field] = false;
      }, 2000);
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
  }

  getFullAddress(): string {
    if (!this.addressData) return '';
    
    const parts = [
      this.addressData.address_line_1,
      this.addressData.address_line_2,
      this.addressData.post_town,
      this.addressData.county,
      this.eircode.toUpperCase()
    ].filter(Boolean);
    
    return parts.join(', ');
  }
} 