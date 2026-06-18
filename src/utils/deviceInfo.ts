import { UAParser } from 'ua-parser-js';
import { getHumanReadableDeviceName } from './deviceUtils';

export async function getDeviceDetails() {
  if (typeof window === 'undefined') return undefined;
  
  let model = '';
  let osVersion = '';
  // Try Client Hints
  if ((navigator as any).userAgentData && (navigator as any).userAgentData.getHighEntropyValues) {
    try {
      const entropy = await (navigator as any).userAgentData.getHighEntropyValues(['model', 'platformVersion']);
      if (entropy.model) {
        model = entropy.model;
      }
      if (entropy.platformVersion && (navigator as any).userAgentData.platform === 'Android') {
         // Convert platformVersion string to number to see if it's correct
         const major = parseInt(entropy.platformVersion.split('.')[0], 10);
         if (!isNaN(major)) {
            // Mapping real android version based on platformVersion (which is occasionally same, but let's just use it)
            // https://wicg.github.io/ua-client-hints/#sec-ch-ua-platform-version
            osVersion = entropy.platformVersion;
         }
      }
    } catch (e) {}
  }

  const parser = new UAParser(window.navigator.userAgent);
  const result = parser.getResult();
  
  if (!model) {
     model = `${result.device.vendor || ''} ${result.device.model || ''}`.trim();
     if (!model && result.browser.name) {
       model = `${result.os.name} Device`; // fallback
     }
  }

  if (model === 'Unknown' || !model || model.endsWith('Device')) {
      const match = navigator.userAgent.match(/\(([^)]+)\)/);
      if (match && match[1]) {
           const parts = match[1].split(';');
           if (parts.length > 2) {
               const potentialModel = parts[2].trim();
               if (potentialModel && !potentialModel.includes('http') && potentialModel.length < 30) {
                   model = potentialModel;
               }
           }
      }
  }
  
  // Clean up
  model = model.replace('wv', '').trim();
  
  // Custom parsing for some common patterns if ua-parser fails
  if (!model || model === 'Unknown' || model.toLowerCase() === 'android device') {
    // Try to find Build string in Android UA
    // e.g. Linux; Android 10; K) Build/QKQ1.200114.002
    const buildMatch = navigator.userAgent.match(/;\s*([^;]+)\s+Build/i);
    if (buildMatch && buildMatch[1]) {
        model = buildMatch[1].trim();
    }
  }

  let finalOsVersion = result.os.version || '';
  if (osVersion && result.os.name === 'Android') {
      // In Android, getHighEntropyValues returns something like '13.0.0'.
      // Some mappings are needed if platformVersion has specific meanings but '13.0.0' means Android 13.
      // E.g. Chrome on Android 10+ freezes UA to Android 10, but gives real version in Client Hints
      const majorVer = parseInt(osVersion.split('.')[0], 10);
      if (majorVer > 0) {
        finalOsVersion = majorVer >= 16 ? `${majorVer}` : (osVersion.includes('.') ? osVersion.split('.')[0] : osVersion);
      }
  }

  let finalModel = model || 'Unknown';
  if (finalModel === 'Unknown' || finalModel.toLowerCase().includes('device')) {
     const hrName = getHumanReadableDeviceName(navigator.userAgent);
     if (hrName !== "Unknown Device") finalModel = hrName;
  } else {
     const hrName = getHumanReadableDeviceName(finalModel);
     if (hrName !== "Unknown Device") finalModel = hrName;
  }

  return {
    os: `${result.os.name || ''} ${finalOsVersion}`.trim() || 'Unknown',
    model: finalModel,
    type: result.device.type || 'desktop'
  };
}
