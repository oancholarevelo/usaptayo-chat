# UsapTayo Chat - Admin System Guide

## Accessing Admin Panel

The admin panel is completely hidden from regular users. You can access it using either method:

### Desktop Method:
- **Keyboard Shortcut**: Press `Ctrl + Shift + A` anywhere in the application

### Mobile/Touch Method:
- **Secret Tap**: Tap the "UsapTayo" title **7 times quickly** (within 3 seconds) on any page
- Works on homepage, loading screens, chat header, or any other page with the title

### After Triggering Access:
1. **Enter Password**: When prompted, enter the secure admin password: `TP9K9p!g4Fq$M-F`
2. **Admin Access**: You'll be taken to the admin dashboard with a success notification

## Admin Features

### Announcement Management
- **View Pending Requests**: See all paid announcement requests waiting for approval
- **Approve Announcements**: Publish announcements that will be visible to all users
- **Reject Announcements**: Decline inappropriate or unwanted announcements with rejection reasons
- **Automatic Expiration**: Approved announcements automatically expire after their paid duration

### Security Features
- **Hidden Access**: No visible admin buttons or links in the UI
- **Cross-Platform**: Works on both desktop (keyboard) and mobile (touch)
- **Strong Password**: Secure password protection (`TP9K9p!g4Fq$M-F`)
- **Owner-Only**: Only the app owner should know about these access methods and password

## Managing Announcement Requests

### Viewing Pending Requests
- The admin panel shows all **pending** announcement requests
- Each request displays:
  - 📅 **Date/Time** when the request was submitted
  - 💰 **Payment amount** (₱10.00)
  - **Message content** that will be displayed
  - **Duration** (10 minutes)
  - **Current status** (pending)

### Before Approving - Payment Verification
**IMPORTANT**: Always verify payment before approving!

1. **Check your GCash/Maya account** for the ₱10.00 payment
2. **Verify the payment timestamp** matches the request time (approximately)
3. **Cross-reference** the payment with the request details

### Approving an Announcement
1. **Click "✅ Approve & Publish"** button
2. **Confirm** in the popup dialog (shows the message again)
3. The announcement will be **immediately published** and visible to all users
4. It will **automatically expire** after 10 minutes
5. The request status changes to "approved"

### Rejecting an Announcement
1. **Click "❌ Reject"** button
2. **Enter a rejection reason** (this gets logged for your records)
3. The request is marked as rejected and won't be processed

## Important Notes

1. **Keep Credentials Secret**: Never share the access methods or password with users
2. **Review Carefully**: Check all announcement content before approving
3. **Use Rejection Reasons**: Provide clear reasons when rejecting announcements
4. **Monitor Regularly**: Check for pending announcements frequently

## Access Methods Summary

### Desktop:
- **Keyboard Shortcut**: `Ctrl + Shift + A`

### Mobile/Touch Devices:
- **Secret Tap**: Tap "UsapTayo" title 7 times quickly (within 3 seconds)

### Password:
- `TP9K9p!g4Fq$M-F`

The admin system is designed to be completely invisible to regular users while providing full control over the announcement system to the app owner across all devices.

## Payment Verification Workflow

1. **User submits announcement request** with payment
2. **Check your payment account** (GCash/Maya) for the ₱10.00 payment
3. **Access admin panel** using desktop shortcut or mobile tap sequence
4. **Review the request** content and payment details
5. **Approve or reject** based on content appropriateness and payment verification
6. **Monitor active announcements** and their expiration

Remember: The admin system is your tool to maintain quality and appropriate content in your chat application while managing the paid announcement feature on any device.

## Accessing Admin Panel

1. **Go to the homepage** of your UsapTayo app
2. **Look for a small gear icon (⚙️)** in the bottom-right corner (it's very faint - opacity 0.1)
3. **Click the gear icon** to access admin login
4. **Enter the admin password** when prompted (current password: `admin123`)

## Managing Announcement Requests

### Viewing Pending Requests
- The admin panel shows all **pending** announcement requests
- Each request displays:
  - 📅 **Date/Time** when the request was submitted
  - 💰 **Payment amount** (₱10.00)
  - **Message content** that will be displayed
  - **Duration** (10 minutes)
  - **Current status** (pending)

### Before Approving - Payment Verification
**IMPORTANT**: Always verify payment before approving!

1. **Check your GCash/Maya account** for the ₱10.00 payment
2. **Verify the payment timestamp** matches the request time (approximately)
3. **Cross-reference** the payment with the request details

### Approving an Announcement
1. **Click "✅ Approve & Publish"** button
2. **Confirm** in the popup dialog (shows the message again)
3. The announcement will be **immediately published** and visible to all users
4. It will **automatically expire** after 10 minutes
5. The request status changes to "approved"

### Rejecting an Announcement
1. **Click "❌ Reject"** button
2. **Enter a rejection reason** (this gets logged for your records)
3. The request is marked as rejected and won't be processed

## Important Security Notes

### Change the Admin Password
**CRITICAL**: Change the default admin password!

1. Open `src/App.js`
2. Find the line: `if (adminPassword === 'admin123') {`
3. Replace `'admin123'` with a strong password
4. Save and redeploy your app

### Payment Verification Process
1. **Always verify payment first** - scammers may try to get free announcements
2. **Check payment timestamps** - payments should be recent
3. **Keep payment records** - screenshot confirmations if needed
4. **Don't approve** if you haven't received payment

## Firebase Data Structure

Your Firebase will have these collections:
- `announcement_requests` - Pending/processed requests
- `announcements` - Currently active announcements (auto-expire)

## Troubleshooting

### Can't access admin panel?
- Make sure you're clicking the gear icon (bottom-right corner)
- Check if you're using the correct password
- Try refreshing the page

### Requests not showing?
- Check Firebase console for data
- Verify users are actually submitting requests
- Check browser console for errors

### Announcements not appearing?
- Check the `announcements` collection in Firebase
- Verify the `expiresAt` timestamp is in the future
- Clear browser cache and refresh

## Best Practices

1. **Check for payment every time** before approving
2. **Review message content** for inappropriate content
3. **Keep admin password secure** and change it regularly
4. **Monitor request volume** and adjust pricing if needed
5. **Log payment confirmations** for your records

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify Firebase rules allow admin operations
3. Ensure your Firebase project is properly configured
4. Test with a small announcement first
