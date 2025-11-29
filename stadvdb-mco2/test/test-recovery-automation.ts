import {
  startRecoveryAutomation,
  stopRecoveryAutomation,
  getRecoveryAutomationStatus,
  forceRecoveryCheck
} from '../lib/recovery-automation';

/**
 * Simple test script to verify recovery automation functionality
 */
async function testRecoveryAutomation() {
  console.log('=== RECOVERY AUTOMATION TEST ===');

  try {
    // Test 1: Start automation
    console.log('\n1. Starting recovery automation...');
    startRecoveryAutomation({
      monitoringInterval: 10000, // 10 seconds for testing
      healthCheckTimeout: 3000,
      enabled: true
    });

    // Test 2: Check status
    console.log('\n2. Checking automation status...');
    const status = getRecoveryAutomationStatus();
    console.log('Status:', status ? JSON.stringify(status, null, 2) : 'Not running');

    // Test 3: Force a recovery check
    console.log('\n3. Forcing manual recovery check...');
    try {
      const recoveryResult = await forceRecoveryCheck();
      console.log('Recovery result:', recoveryResult);
    } catch (error) {
      console.log('Recovery check failed (expected if no pending operations):', error);
    }

    // Test 4: Wait a bit to see monitoring in action
    console.log('\n4. Waiting 15 seconds to observe monitoring...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Test 5: Check status again
    console.log('\n5. Checking status after monitoring...');
    const statusAfter = getRecoveryAutomationStatus();
    console.log('Status after:', statusAfter ? JSON.stringify(statusAfter, null, 2) : 'Not running');

    // Test 6: Stop automation
    console.log('\n6. Stopping automation...');
    stopRecoveryAutomation();

    const finalStatus = getRecoveryAutomationStatus();
    console.log('Final status:', finalStatus);

    console.log('\n=== TEST COMPLETE ===');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testRecoveryAutomation().catch(console.error);
}

export { testRecoveryAutomation };