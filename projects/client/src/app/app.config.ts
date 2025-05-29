import { ApplicationConfig, importProvidersFrom, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(),
    importProvidersFrom(
      FormsModule,
      ReactiveFormsModule
    )
    // Temporarily disabled service worker to prevent caching issues
    // , provideServiceWorker('ngsw-worker.js', {
    //         enabled: !isDevMode(),
    //         registrationStrategy: 'registerImmediately'
    //       })
  ]
};
