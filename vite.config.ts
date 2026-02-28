import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'airflow_calendar/ui/CalendarComponent.tsx'),
      name: 'AirflowCalendar',
      fileName: 'calendar_bundle',
      formats: ['iife']
    },
    outDir: 'airflow_calendar/static/airflow_calendar',
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  }
});