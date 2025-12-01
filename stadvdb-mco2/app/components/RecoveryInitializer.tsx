'use client';

import { useEffect, useState } from 'react';

/**
 * RecoveryInitializer Component
 *
 * This component automatically starts the recovery automation system
 * when the application loads and provides a way to monitor its status.
 */
export default function RecoveryInitializer() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeRecovery = async () => {
      try {
        console.log('RECOVERY_INIT: Initializing automated recovery system...');

        // Start the recovery automation
        const response = await fetch('/api/recovery/auto', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'start',
            config: {
              monitoringInterval: 60000, // 60 seconds
              healthCheckTimeout: 5000,  // 5 seconds
              enabled: true
            }
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to start recovery automation');
        }

        const result = await response.json();

        if (isMounted) {
          setIsInitialized(true);
          setInitError(null);
          console.log('RECOVERY_INIT: Recovery automation started successfully:', result.data.message);
        }

      } catch (error: any) {
        console.error('RECOVERY_INIT: Failed to initialize recovery automation:', error.message);

        if (isMounted) {
          setInitError(error.message);
        }
      }
    };

    // Initialize recovery automation after a short delay to ensure API is ready
    const initTimer = setTimeout(() => {
      initializeRecovery();
    }, 1000);

    // Cleanup function
    return () => {
      isMounted = false;
      clearTimeout(initTimer);
    };
  }, []);

  // This component doesn't render anything visible by default
  // But during development, you can uncomment the JSX below to see the status

  // return (
  //   <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-3 border text-xs max-w-xs z-50">
  //     <div className="font-semibold text-gray-800 mb-1">Recovery Status</div>
  //     {isInitialized ? (
  //       <div className="text-green-600 flex items-center gap-1">
  //         <div className="w-2 h-2 bg-green-500 rounded-full"></div>
  //         Auto-recovery enabled
  //       </div>
  //     ) : initError ? (
  //       <div className="text-red-600 flex items-center gap-1">
  //         <div className="w-2 h-2 bg-red-500 rounded-full"></div>
  //         {initError}
  //       </div>
  //     ) : (
  //       <div className="text-yellow-600 flex items-center gap-1">
  //         <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
  //         Initializing...
  //       </div>
  //     )}
  //   </div>
  // );

  return null; // Hidden by default - recovery runs in background
}