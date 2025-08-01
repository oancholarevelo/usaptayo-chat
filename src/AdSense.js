import React, { useEffect } from 'react';

const AdSense = ({ adSlot }) => {
  useEffect(() => {
    // Check if Google AdSense script is already loaded
    if (window.adsbygoogle && window.adsbygoogle.length > 0) {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  }, []);

  return (
    <div style={{ padding: '1rem', textAlign: 'center' }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-3070267591032093"
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    </div>
  );
};

export default AdSense;