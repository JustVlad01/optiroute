import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Enable more detailed error information
(window as any).ng = {};
(window as any).ng.profiler = { timeChangeDetection: true };

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => {
    console.error('Application bootstrap error:', err);
    console.error('Error details:', JSON.stringify(err, null, 2));
  });
