import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  constructor(private pwaService: PwaService) { }
  
  onAroundNoonClick(): void {
    this.pwaService.handleAroundNoonClick();
  }
} 