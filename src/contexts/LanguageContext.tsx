import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';
import { safeStorage } from '../utils/safeStorage';

export type Language = 'en' | 'ur-roman' | 'ur';

const translations: Record<string, Record<Language, string>> = {
  'City': { en: 'City', 'ur-roman': 'Shehar', ur: 'شہر' },
  'Enter your city': { en: 'Enter your city', 'ur-roman': 'Apna shehar darj karein', ur: 'اپنا شہر درج کریں' },
  'City cannot be changed once set.': { en: 'City cannot be changed once set.', 'ur-roman': 'Shehar set karne ke baad badla nahi ja sakta.', ur: 'شہر ایک بار سیٹ ہونے کے بعد تبدیل نہیں کیا جا سکتا۔' },
  'You can only set your city once.': { en: 'You can only set your city once.', 'ur-roman': 'Aap apna shehar sirf aik baar set kar sakte hain.', ur: 'آپ اپنا شہر صرف ایک بار سیٹ کر سکتے ہیں۔' },

  'Join the group — save up to 44%': { en: 'Join the group — save up to 44%', 'ur-roman': 'Group join karein — 44% tak bachayein', ur: 'گروپ میں شامل ہوں — 44% تک بچائیں' },
  'Save 17%': { en: 'Save 17%', 'ur-roman': '17% bachayein', ur: '17% بچائیں' },


  'Search and Filters': { en: 'Search and Filters', 'ur-roman': 'Search aur Filters', ur: 'تلاش اور فلٹرز' },
  'Clear Filters': { en: 'Clear Filters', 'ur-roman': 'Filters hatayein', ur: 'فلٹرز ہٹائیں' },
  'Install App': { en: 'Install App', 'ur-roman': 'App Install Karein', ur: 'ایپ انسٹال کریں' },

  'About %APP_NAME%': { en: 'About %APP_NAME%', 'ur-roman': '%APP_NAME% Ke Baray Mein', ur: '%APP_NAME% کے بارے میں' },

  'Web Series Season': { en: 'Web Series Season', 'ur-roman': 'Web Series Season', ur: 'ویب سیریز سیزن' },
  'PKR 100': { en: 'PKR 100', 'ur-roman': 'PKR 100', ur: '100 روپے' },
  'PKR 300': { en: 'PKR 300', 'ur-roman': 'PKR 300', ur: '300 روپے' },
  'PKR 750': { en: 'PKR 750', 'ur-roman': 'PKR 750', ur: '750 روپے' },
  'PKR 900': { en: 'PKR 900', 'ur-roman': 'PKR 900', ur: '900 روپے' },
  'PKR 1,400': { en: 'PKR 1,400', 'ur-roman': 'PKR 1,400', ur: '1,400 روپے' },
  'PKR 1,800': { en: 'PKR 1,800', 'ur-roman': 'PKR 1,800', ur: '1,800 روپے' },
  'PKR 2,600': { en: 'PKR 2,600', 'ur-roman': 'PKR 2,600', ur: '2,600 روپے' },
  'PKR 3,600': { en: 'PKR 3,600', 'ur-roman': 'PKR 3,600', ur: '3,600 روپے' },
  'PKR 4,000': { en: 'PKR 4,000', 'ur-roman': 'PKR 4,000', ur: '4,000 روپے' },
  'PKR 7,200': { en: 'PKR 7,200', 'ur-roman': 'PKR 7,200', ur: '7,200 روپے' },
  '≈ PKR 300/month': { en: '≈ PKR 300/month', 'ur-roman': '≈ PKR 300/mahina', ur: '≈ 300 روپے/مہینہ' },
  'per season': { en: 'per season', 'ur-roman': 'har season ke liye', ur: 'فی سیزن' },
  'Any web series season': { en: 'Any web series season', 'ur-roman': 'Koi bhi web series season', ur: 'کوئی بھی ویب سیریز سیزن' },

  '1 Month': { en: '1 Month', 'ur-roman': '1 Mahina', ur: '1 مہینہ' },
  '3 Months': { en: '3 Months', 'ur-roman': '3 Mahinay', ur: '3 مہینے' },
  '6 Months': { en: '6 Months', 'ur-roman': '6 Mahinay', ur: '6 مہینے' },
  '1 Year': { en: '1 Year', 'ur-roman': '1 Saal', ur: '1 سال' },
  '2 Years': { en: '2 Years', 'ur-roman': '2 Saal', ur: '2 سال' },
  '≈ PKR 250/month': { en: '≈ PKR 250/month', 'ur-roman': '≈ PKR 250/mahina', ur: '≈ 250 روپے/مہینہ' },
  '≈ PKR 233/month': { en: '≈ PKR 233/month', 'ur-roman': '≈ PKR 233/mahina', ur: '≈ 233 روپے/مہینہ' },
  '≈ PKR 217/month': { en: '≈ PKR 217/month', 'ur-roman': '≈ PKR 217/mahina', ur: '≈ 217 روپے/مہینہ' },
  '≈ PKR 167/month': { en: '≈ PKR 167/month', 'ur-roman': '≈ PKR 167/mahina', ur: '≈ 167 روپے/مہینہ' },
  'Save PKR 150': { en: 'Save PKR 150', 'ur-roman': 'PKR 150 bachayein', ur: '150 روپے بچائیں' },
  'Save PKR 400': { en: 'Save PKR 400', 'ur-roman': 'PKR 400 bachayein', ur: '400 روپے بچائیں' },
  'Save PKR 1,000': { en: 'Save PKR 1,000', 'ur-roman': 'PKR 1,000 bachayein', ur: '1,000 روپے بچائیں' },
  'Save PKR 3,200': { en: 'Save PKR 3,200', 'ur-roman': 'PKR 3,200 bachayein', ur: '3,200 روپے بچائیں' },
  'Daily 6–7 HD movies': { en: 'Daily 6–7 HD movies', 'ur-roman': 'Rozana 6–7 HD movies', ur: 'روزانہ 6-7 ایچ ڈی موویز' },
  'Daily 6–7 Movies': { en: 'Daily 6–7 Movies', 'ur-roman': 'Rozana 6–7 Movies', ur: 'روزانہ 6-7 موویز' },
  'Latest web series': { en: 'Latest web series', 'ur-roman': 'Latest web series', ur: 'تازہ ترین ویب سیریز' },
  'Latest Web Series': { en: 'Latest Web Series', 'ur-roman': 'Latest Web Series', ur: 'تازہ ترین ویب سیریز' },
  'HD Quality': { en: 'HD Quality', 'ur-roman': 'HD Quality', ur: 'ایچ ڈی کوالٹی' },
  'Priority Updates': { en: 'Priority Updates', 'ur-roman': 'Priority Updates', ur: 'ترجیحی اپ ڈیٹس' },
  'Priority WhatsApp support': { en: 'Priority WhatsApp support', 'ur-roman': 'Priority WhatsApp support', ur: 'ترجیحی واٹس ایپ سپورٹ' },
  'Most Popular • Save 22%': { en: 'Most Popular • Save 22%', 'ur-roman': 'Sab se maqbool • 22% bachayein', ur: 'سب سے مقبول • 22% بچائیں' },
  'Best Value • Save 28%': { en: 'Best Value • Save 28%', 'ur-roman': 'Behtareen Value • 28% bachayein', ur: 'بہترین ویلیو • 28% بچائیں' },
  'Mega Saver • Save 44%': { en: 'Mega Saver • Save 44%', 'ur-roman': 'Mega Saver • 44% bachayein', ur: 'میگا سیور • 44% بچائیں' },
  'Request Movie': { en: 'Request Movie', 'ur-roman': 'Movie ki Request Karein', ur: 'مووی کی درخواست کریں' },
  'Title': { en: 'Title', 'ur-roman': 'Naam', ur: 'عنوان' },
  'Type': { en: 'Type', 'ur-roman': 'Qisam', ur: 'قسم' },
  'Year': { en: 'Year', 'ur-roman': 'Saal', ur: 'سال' },
  'Cancel': { en: 'Cancel', 'ur-roman': 'Kansal', ur: 'منسوخ' },
  'Submit': { en: 'Submit', 'ur-roman': 'Bhejein', ur: 'ارسال کریں' },
  'Submitting...': { en: 'Submitting...', 'ur-roman': 'Bheja ja raha hai...', ur: 'ارسال کیا جا رہا ہے...' },
  'You can only have 3 pending requests at a time.': { en: 'You can only have 3 pending requests at a time.', 'ur-roman': 'Aap ek waqt mein sirf 3 pending requests rakh sakte hain.', ur: 'آپ ایک وقت میں صرف 3 زیر التواء درخواستیں رکھ سکتے ہیں۔' },
  'Request submitted successfully!': { en: 'Request submitted successfully!', 'ur-roman': 'Request kamyabi se bhej di gayi!', ur: 'درخواست کامیابی سے ارسال ہو گئی!' },
  'You have already requested this exact movie.': { en: 'You have already requested this exact movie.', 'ur-roman': 'Aap yeh movie pehle hi request kar chuke hain.', ur: 'آپ یہ مووی پہلے ہی منگوا چکے ہیں۔' },
  'Failed to submit request.': { en: 'Failed to submit request.', 'ur-roman': 'Request bhejne mein nakami hui.', ur: 'درخواست ارسال کرنے میں ناکامی ہوئی۔' },
  'No Contact Info': { en: 'No Contact Info', 'ur-roman': 'Koi Rabta Maloomat Nahi', ur: 'کوئی رابطہ معلومات نہیں' },
  'Refresh App Data': { en: 'Refresh App Data', 'ur-roman': 'App Data Fresh Karein', ur: 'ایپ ڈیٹا ریفریش کریں' },
  'Refreshing...': { en: 'Refreshing...', 'ur-roman': 'Fresh ho raha hai...', ur: 'تازہ کاری جاری ہے...' },
  'Haptics': { en: 'Haptics', 'ur-roman': 'Vibration', ur: 'وائبریشن' },
  'Theme': { en: 'Theme', 'ur-roman': 'Theme', ur: 'تھیم' },
  'Language': { en: 'Language', 'ur-roman': 'Zabaan', ur: 'زبان' },
  'Sign Out': { en: 'Sign Out', 'ur-roman': 'Sign Out Karein', ur: 'سائن آؤٹ' },
  'Notifications': { en: 'Notifications', 'ur-roman': 'Ittelaat', ur: 'اطلاعات' },
  'No notifications yet': { en: 'No notifications yet', 'ur-roman': 'Abhi koi ittelaat nahi hain', ur: 'ابھی کوئی اطلاعات نہیں ہیں' },
  'new': { en: 'new', 'ur-roman': 'nayi', ur: 'نئی' },
  'View Movie': { en: 'View Movie', 'ur-roman': 'Movie Dekhein', ur: 'مووی دیکھیں' },
  'View Series': { en: 'View Series', 'ur-roman': 'Series Dekhein', ur: 'سیریز دیکھیں' },
  'Telegram Download': { en: 'Telegram Download', 'ur-roman': 'Telegram Download', ur: 'ٹیلیگرام ڈاؤن لوڈ' },
  'Movie Links': { en: 'Movie Links', 'ur-roman': 'Movie Links', ur: 'مووی لنکس' },
  'Full Series ZIP': { en: 'Full Series ZIP', 'ur-roman': 'Full Series ZIP', ur: 'مکمل سیریز زپ' },
  'Full Series MKV': { en: 'Full Series MKV', 'ur-roman': 'Full Series MKV', ur: 'مکمل سیریز ایم کے وی' },
  'Season': { en: 'Season', 'ur-roman': 'Season', ur: 'سیزن' },
  'Episodes': { en: 'Episodes', 'ur-roman': 'Qistain', ur: 'اقساط' },
  'Download via Telegram': { en: 'Download via Telegram', 'ur-roman': 'Telegram se Download Karein', ur: 'ٹیلیگرام کے ذریعے ڈاؤن لوڈ کریں' },
  'Resolving...': { en: 'Resolving...', 'ur-roman': 'Link khol raha hai...', ur: 'لنک تیار ہو رہا ہے...' },
  'Failed to resolve Telegram link': { en: 'Failed to resolve Telegram link', 'ur-roman': 'Telegram link nahi khul saka', ur: 'ٹیلیگرام لنک حل کرنے میں ناکامی' },
  'An error occurred predicting Telegram link': { en: 'An error occurred predicting Telegram link', 'ur-roman': 'Telegram link mein masla hua', ur: 'ٹیلیگرام لنک میں غلطی پیش آئی' },
  'Play Content': { en: 'Play Content', 'ur-roman': 'Content Play Karein', ur: 'مووی چلائیں' },
  'How would you like to open': { en: 'How would you like to open', 'ur-roman': 'Aap kaise kholna chahte hain', ur: 'آپ کس طرح کھولنا چاہتے ہیں' },
  'Select Server': { en: 'Select Server', 'ur-roman': 'Server Muntakhib Karein', ur: 'سرور منتخب کریں' },
  'Play in Video Player': { en: 'Play in Video Player', 'ur-roman': 'Video Player Mein Chalayein', ur: 'ویڈیو پلیئر میں چلائیں' },
  'MX Player': { en: 'MX Player', 'ur-roman': 'MX Player', ur: 'ایم ایکس پلیئر' },
  'VLC Player': { en: 'VLC Player', 'ur-roman': 'VLC Player', ur: 'وی ایل سی پلیئر' },
  'Report Link (if not Working)': { en: 'Report Link (if not Working)', 'ur-roman': 'Link Kharab hone par Report karein', ur: 'لنک خراب ہونے پر رپورٹ کریں' },
  'Report Link': { en: 'Report Link', 'ur-roman': 'Link Report Karein', ur: 'لنک رپورٹ کریں' },
  'Sending...': { en: 'Sending...', 'ur-roman': 'Bheja ja raha hai...', ur: 'بھیجا جا رہا ہے...' },
  'Copy Link': { en: 'Copy Link', 'ur-roman': 'Link Copy Karein', ur: 'لنک کاپی کریں' },
  'Download': { en: 'Download', 'ur-roman': 'Download Karein', ur: 'ڈاؤن لوڈ کریں' },
  'Extracting link...': { en: 'Extracting link...', 'ur-roman': 'Link nikal raha hai...', ur: 'لنک نکالا جا رہا ہے...' },
  'Select Trailer': { en: 'Select Trailer', 'ur-roman': 'Trailer Muntakhib Karein', ur: 'ٹریلر منتخب کریں' },
  'Open externally': { en: 'Open externally', 'ur-roman': 'Bahar kholain', ur: 'باہر کھولیں' },
  'Open in New Tab': { en: 'Open in New Tab', 'ur-roman': 'Naye Tab mein Kholein', ur: 'نئے ٹیب میں کھولیں' },
  'This trailer cannot be played directly here.': { en: 'This trailer cannot be played directly here.', 'ur-roman': 'Yeh trailer yahan nahi chal sakta.', ur: 'یہ ٹریلر یہاں براہ راست نہیں چل سکتا۔' },
  'Sign in required': { en: 'Sign in required', 'ur-roman': 'Sign in Zaroori Hai', ur: 'سائن ان ضروری ہے' },
  'Please sign in or log in to access links and watch this content.': { en: 'Please sign in or log in to access links and watch this content.', 'ur-roman': 'Links aur content dekhne ke liye baraye meharbani log in karein.', ur: 'لنکس اور مواد تک رسائی کے لیے براے مہربانی لاگ ان کریں۔' },
  'Log In': { en: 'Log In', 'ur-roman': 'Log In Karein', ur: 'لاگ ان کریں' },
  'Are you sure you want to download this file via Telegram?': { en: 'Are you sure you want to download this file via Telegram?', 'ur-roman': 'Kya aap yeh file Telegram se download karna chahte hain?', ur: 'کیا آپ یہ فائل ٹیلیگرام کے ذریعے ڈاؤن لوڈ کرنا چاہتے ہیں؟' },
  'Join Now': { en: 'Join Now', 'ur-roman': 'Abhi Join Karein', ur: 'ابھی جوائن کریں' },
  'Trending Movies': { en: 'Trending Movies', 'ur-roman': 'Trending Movies', ur: 'ٹرینڈنگ موویز' },

  'Rewards & Referrals': { en: 'Rewards & Referrals', 'ur-roman': 'Inamat aur Referrals', ur: 'انعامات اور ریفرلز' },
  'Get 5 Days Free VIP Access!': { en: 'Get 5 Days Free VIP Access!', 'ur-roman': '5 Din Ka Muft VIP Access Haasil Karein!', ur: '5 دن کی مفت VIP رسائی حاصل کریں!' },
  'Invite friends to MovizNow and unlock 5 days of premium access for both of you!': { en: 'Invite friends to MovizNow and unlock 5 days of premium access for both of you!', 'ur-roman': 'Doston ko MovizNow par invite karein aur dono ke liye 5 din ki premium membership haasil karein!', ur: 'دوستوں کو MovizNow پر مدعو کریں اور آپ دونوں کے لیے 5 دن کی پریمیم رسائی حاصل کریں!' },
  'Invite & Earn 5 Days Free': { en: 'Invite & Earn 5 Days Free', 'ur-roman': 'Invite Karein & 5 Din Muft Jeetein', ur: 'مدعو کریں اور 5 دن مفت حاصل کریں' },
  'Special Referral Offer': { en: 'Special Referral Offer', 'ur-roman': 'Khas Referral Offer', ur: 'خاص ریفرل پیشکش' },
  'Share Offer': { en: 'Share Offer', 'ur-roman': 'Offer Share Karein', ur: 'پیشکش شیئر کریں' },
  'Copied!': { en: 'Copied!', 'ur-roman': 'Copy Ho Gaya!', ur: 'کاپی ہو گیا!' },
  '+5 Days VIP': { en: '+5 Days VIP', 'ur-roman': '+5 Din VIP', ur: '5+ دن VIP' },
  'Get 5 days of premium membership for free on MovizNow!': { en: 'Get 5 days of premium membership for free on MovizNow!', 'ur-roman': 'MovizNow par 5 din ki muft premium membership haasil karein!', ur: 'MovizNow پر 5 دن کی مفت پریمیم ممبرشپ حاصل کریں!' },
  'Dismiss': { en: 'Dismiss', 'ur-roman': 'Khatam Karein', ur: 'بند کریں' },
  'Rewards': { en: 'Rewards', 'ur-roman': 'Inamat', ur: 'انعامات' },
  'Next Goal': { en: 'Next Goal', 'ur-roman': 'Agla Maqsad', ur: 'اگلا مقصد' },
  'Referrals': { en: 'Referrals', 'ur-roman': 'Referrals', ur: 'ریفرلز' },
  'Signups': { en: 'Signups', 'ur-roman': 'Signups', ur: 'سائن اپس' },
  'Activated': { en: 'Activated', 'ur-roman': 'Activated', ur: 'فعال' },
  'Bonus Days': { en: 'Bonus Days', 'ur-roman': 'Bonus Din', ur: 'بونس دن' },
  'Refer & Earn': { en: 'Refer & Earn', 'ur-roman': 'Refer Karein aur Kamayein', ur: 'ریفر کریں اور کمائیں' },
  'Invite friends and both of you get 5 days of premium instantly!': { en: 'Invite friends and both of you get 5 days of premium instantly!', 'ur-roman': 'Doston ko invite karein aur dono ko foran 5 din ki premium membership milegi!', ur: 'دوستوں کو مدعو کریں اور آپ دونوں کو فوری طور پر 5 دن کی پریمیم ممبرشپ ملے گی!' },
  'Your Code': { en: 'Your Code', 'ur-roman': 'Aap ka Code', ur: 'آپ کا کوڈ' },
  'Link': { en: 'Link', 'ur-roman': 'Link', ur: 'لنک' },
  'Native Share': { en: 'Native Share', 'ur-roman': 'Native Share', ur: 'شیئر کریں' },
  'Invite your first friend': { en: 'Invite your first friend', 'ur-roman': 'Apne pehle dost ko invite karein', ur: 'اپنے پہلے دوست کو مدعو کریں' },
  'Sharing is caring! Invite your friends to join MovizNow and unlock exclusive rewards together.': { en: 'Sharing is caring! Invite your friends to join MovizNow and unlock exclusive rewards together.', 'ur-roman': 'Sharing is caring! Apne doston ko MovizNow par bulayein aur mil kar inamat jeetein.', ur: 'شیئرنگ ہی کیئرنگ ہے! اپنے دوستوں کو MovizNow میں شامل ہونے کے لیے مدعو کریں اور مل کر خصوصی انعامات حاصل کریں۔' },
  'Start Sharing Now': { en: 'Start Sharing Now', 'ur-roman': 'Abhi share karna shuru karein', ur: 'ابھی شیئر کرنا شروع کریں' },
  'Enable Notifications': { en: 'Enable Notifications', 'ur-roman': 'Notifications on karein', ur: 'اطلاعات کو فعال کریں' },
  'Get 3 days of extra membership by enabling push notifications for updates.': { en: 'Get 3 days of extra membership by enabling push notifications for updates.', 'ur-roman': 'Updates ke liye push notifications on karein aur 3 din ki extra membership haasil karein.', ur: 'اپ ڈیٹس کے لیے پش نوٹیفیکیشنز کو فعال کر کے 3 دن کی اضافی ممبرشپ حاصل کریں۔' },
  'Notification Permissions': { en: 'Notification Permissions', 'ur-roman': 'Notification ki ijazat', ur: 'اطلاعات کی اجازت' },
  'Already Enabled': { en: 'Already Enabled', 'ur-roman': 'Pehle se on hai', ur: 'پہلے ہی فعال ہے' },
  'Claimed': { en: 'Claimed', 'ur-roman': 'Haasil kar liya', ur: 'حاصل کر لیا' },
  'Recent Referral Activity': { en: 'Recent Referral Activity', 'ur-roman': 'Haal hi ki referral activity', ur: 'حالیہ ریفرل سرگرمی' },
  'Recently': { en: 'Recently', 'ur-roman': 'Haal hi mein', ur: 'حال ہی میں' },
  'Days': { en: 'Days', 'ur-roman': 'Din', ur: 'دن' },
  'How it works': { en: 'How it works', 'ur-roman': 'Ye kaise kaam karta hai', ur: 'یہ کیسے کام کرتا ہے' },
  'Share your unique link or code with friends.': { en: 'Share your unique link or code with friends.', 'ur-roman': 'Apna makhsoos link ya code doston ke saath share karein.', ur: 'اپنا منفرد لنک یا کوڈ دوستوں کے ساتھ شیئر کریں۔' },
  'Both you and your friend get 5 days of premium instantly when they sign up!': { en: 'Both you and your friend get 5 days of premium instantly when they sign up!', 'ur-roman': 'Dost ke sign up karne par aap dono ko foran 5 din ki premium membership milegi!', ur: 'دوست کے سائن اپ کرنے پر آپ دونوں کو فوری طور پر 5 دن کی پریمیم ممبرشپ ملے گی!' },
  'Get another 5 days for yourself when your friend activates their membership.': { en: 'Get another 5 days for yourself when your friend activates their membership.', 'ur-roman': 'Jab aapka dost apni membership activate karega to aapko mazeed 5 din milenge.', ur: 'جب آپ کا دوست اپنی ممبرشپ فعال کرے گا تو آپ کو مزید 5 دن ملیں گے۔' },
  'Membership is extended automatically from your current expiry.': { en: 'Membership is extended automatically from your current expiry.', 'ur-roman': 'Membership aapki maujuda expiry se khud-ba-khud barh jayegi.', ur: 'ممبرشپ آپ کی موجودہ میعاد ختم ہونے سے خود بخود بڑھ جائے گی۔' },
  'Diamond Referrer': { en: 'Diamond Referrer', 'ur-roman': 'Diamond Referrer', ur: 'ڈائمنڈ ریفرر' },
  'Platinum Referrer': { en: 'Platinum Referrer', 'ur-roman': 'Platinum Referrer', ur: 'پلاٹینم ریفرر' },
  'Gold Referrer': { en: 'Gold Referrer', 'ur-roman': 'Gold Referrer', ur: 'گولڈ ریفرر' },
  'Silver Referrer': { en: 'Silver Referrer', 'ur-roman': 'Silver Referrer', ur: 'سلور ریفرر' },
  'Bronze Referrer': { en: 'Bronze Referrer', 'ur-roman': 'Bronze Referrer', ur: 'برونز ریفرر' },
  'Newcomer': { en: 'Newcomer', 'ur-roman': 'Naya shamil shuda', ur: 'نووارد' },
  'Join MovizNow': { en: 'Join MovizNow', 'ur-roman': 'MovizNow join karein', ur: 'MovizNow میں شامل ہوں' },
  'Signed Up': { en: 'Signed Up', 'ur-roman': 'Sign up ho gaya', ur: 'سائن اپ کر لیا' },
  'Paid Members': { en: 'Paid Members', 'ur-roman': 'Paid Members', ur: 'پیڈ ممبرز' },
  'Total Days': { en: 'Total Days', 'ur-roman': 'Kul Din', ur: 'کل دن' },
  'One-Time Rewards': { en: 'One-Time Rewards', 'ur-roman': 'Ek dafa milne wale inamat', ur: 'ایک بار ملنے والے انعامات' },
  'Referral Signup (+5 Days)': { en: 'Referral Signup (+5 Days)', 'ur-roman': 'Referral Signup (+5 Din)', ur: 'ریفرل سائن اپ (+5 دن)' },
  'Share your link/code with friends to get 5 days extension for every friend who joins.': { en: 'Share your link/code with friends to get 5 days extension for every friend who joins.', 'ur-roman': 'Doston ke sath apna link/code share karein aur har join karne wale dost par 5 din ki meaad barhayein.', ur: 'دوستوں کے ساتھ اپنا لنک/کوڈ شیئر کریں اور ہر شامل ہونے والے دوست پر 5 دن کی میعاد بڑھائیں۔' },
  'Referral Activation (+5 Days)': { en: 'Referral Activation (+5 Days)', 'ur-roman': 'Referral Activation (+5 Din)', ur: 'ریفرل ایکٹیویشن (+5 دن)' },
  'Get an extra 5 days extension when your referred friend purchases a membership.': { en: 'Get an extra 5 days extension when your referred friend purchases a membership.', 'ur-roman': 'Jab aapka referred dost membership khareeday ga to zafi 5 din barhayein.', ur: 'جب آپ کا ریفر کردہ دوست ممبرشپ خریدے گا تو اضافی 5 دن حاصل کریں۔' },
  'Install App (+3 Days)': { en: 'Install App (+3 Days)', 'ur-roman': 'App Install Karein (+3 Din)', ur: 'ایپ انسٹال کریں (+3 دن)' },
  'Install our PWA app on your home screen for a 3 days membership extension.': { en: 'Install our PWA app on your home screen for a 3 days membership extension.', 'ur-roman': '3 din ki membership barhane ke liye hamari PWA app ko home screen par install karein.', ur: '3 دن کی ممبرشپ کی میعاد بڑھانے کے لیے ہماری PWA ایپ کو ہوم اسکرین پر انسٹال کریں۔' },
  'Enable Notifications (+3 Days)': { en: 'Enable Notifications (+3 Days)', 'ur-roman': 'Notifications On Karein (+3 Din)', ur: 'اطلاعات فعال کریں (+3 دن)' },
  'Enable push notifications to stay updated and get a 3 days membership extension.': { en: 'Enable push notifications to stay updated and get a 3 days membership extension.', 'ur-roman': 'Bakhabar rehne aur 3 din ki membership barhane ke liye push notifications on karein.', ur: 'باخبر رہنے اور 3 دن کی ممبرشپ کی میعاد بڑھانے کے لیے پش اطلاعات کو فعال کریں۔' },
  'Submit a Review (+5 Days)': { en: 'Submit a Review (+5 Days)', 'ur-roman': 'Review Bhejein (+5 Din)', ur: 'جائزہ جمع کریں (+5 دن)' },
  'Write a review and rate our app to get a free 5 days membership extension.': { en: 'Write a review and rate our app to get a free 5 days membership extension.', 'ur-roman': 'Muft 5 din ki membership barhane ke liye review likhein aur hamari app ko rate karein.', ur: 'مفت 5 دن کی ممبرشپ کی میعاد بڑھانے کے لیے جائزہ لکھیں اور ہماری ایپ کو درجہ دیں۔' },
  'Submit a Review': { en: 'Submit a Review', 'ur-roman': 'Review Bhejein', ur: 'جائزہ جمع کریں' },
  'Rate our app & share feedback': { en: 'Rate our app & share feedback', 'ur-roman': 'Hamari app ko rate karein aur rai dein', ur: 'ہماری ایپ کو درجہ دیں اور رائے شیئر کریں' },
  'Write Review (+5 Days)': { en: 'Write Review (+5 Days)', 'ur-roman': 'Review Likhein (+5 Din)', ur: 'جائزہ لکھیں (+5 دن)' },
  'Claim Reward (+3 Days)': { en: 'Claim Reward (+3 Days)', 'ur-roman': 'Inam Claim Karein (+3 Din)', ur: 'انعام حاصل کریں (+3 دن)' },
  'Enable (+3 Days)': { en: 'Enable (+3 Days)', 'ur-roman': 'On Karein (+3 Din)', ur: 'فعال کریں (+3 دن)' },
  'Install (+3 Days)': { en: 'Install (+3 Days)', 'ur-roman': 'Install Karein (+3 Din)', ur: 'انسٹال کریں (+3 دن)' },
  'Claimed (+3 Days)': { en: 'Claimed (+3 Days)', 'ur-roman': 'Claim Ho Gaya (+3 Din)', ur: 'حاصل کر لیا (+3 دن)' },
  'Stay updated with latest content': { en: 'Stay updated with latest content', 'ur-roman': 'Latest content se bakhabar rahein', ur: 'تازہ ترین مواد سے باخبر رہیں' },
  'Better experience on home screen': { en: 'Better experience on home screen', 'ur-roman': 'Home screen par behtar tajurba', ur: 'ہوم اسکرین پر بہتر تجربہ' },
  'Enable': { en: 'Enable', 'ur-roman': 'On karein', ur: 'فعال کریں' },
  'Installed': { en: 'Installed', 'ur-roman': 'Install ho gayi', ur: 'انسٹال ہو گئی' },
  'Install': { en: 'Install', 'ur-roman': 'Install', ur: 'انسٹال' },
  'Referral Limit': { en: 'Referral Limit', 'ur-roman': 'Referral ki had', ur: 'ریفرل کی حد' },
  'This referral offer is only available for new users or new joining only.': { en: 'This referral offer is only available for new users or new joining only.', 'ur-roman': 'Ye referral offer sirf naye users ke liye hai.', ur: 'یہ ریفرل پیشکش صرف نئے صارفین یا نئی شمولیت کے لیے دستیاب ہے۔' },
  'Expiry': { en: 'Expiry', 'ur-roman': 'Expiry', ur: 'میعاد ختم' },
  'Lifetime': { en: 'Lifetime', 'ur-roman': 'Lifetime', ur: 'تاحیات' },
  'Reported Links': { en: 'Reported Links', 'ur-roman': 'Reported Links', ur: 'رپورٹ شدہ لنکس' },
  'Movie Requests': { en: 'Movie Requests', 'ur-roman': 'Movie ki requests', ur: 'مووی کی درخواستیں' },

  'Free movie download sites in Pakistan are illegal, full of viruses, popups aur VPN ki zaroorat hoti hai.': { en: 'Free movie download sites in Pakistan are illegal, full of viruses, popups aur VPN ki zaroorat hoti hai.', 'ur-roman': 'Pakistan mein free movie download sites ghair kanooni hain, virus se bhari hain, popups aate hain aur VPN ki zaroorat hoti hai.', ur: 'پاکستان میں مفت مووی ڈاؤن لوڈ سائٹس غیر قانونی ہیں، وائرس سے بھری ہیں، پاپ اپس آتے ہیں اور وی پی این کی ضرورت ہوتی ہے۔' },
  'Safe legal alternative hai — full HD Bollywood, Hollywood, Punjabi aur Pakistani movies sirf PKR 50 me, seedha WhatsApp par delivery. Ek biscuit ki price me poori HD movie.': { en: 'Safe legal alternative hai — full HD Bollywood, Hollywood, Punjabi aur Pakistani movies sirf PKR 50 me, seedha WhatsApp par delivery. Ek biscuit ki price me poori HD movie.', 'ur-roman': 'Ye ek mehfooz kanooni mutabadil hai — full HD Bollywood, Hollywood, Punjabi aur Pakistani movies sirf PKR 50 mein, seedha WhatsApp par delivery. Ek biscuit ki qeemat mein poori HD movie.', ur: 'یہ ایک محفوظ قانونی متبادل ہے — فل ایچ ڈی بالی ووڈ، ہالی ووڈ، پنجابی اور پاکستانی موویز صرف 50 روپے میں، سیدھا واٹس ایپ پر ڈیلیوری۔ ایک بسکٹ کی قیمت میں پوری ایچ ڈی مووی۔' },


  'Delete Review': { en: 'Delete Review', 'ur-roman': 'Review Delete Karein', ur: 'جائزہ حذف کریں' },
  'No reviews yet. Be the first to review!': { en: 'No reviews yet. Be the first to review!', 'ur-roman': 'Abhi tak koi review nahi. Pehla review ap dein!', ur: 'ابھی تک کوئی جائزہ نہیں۔ پہلا جائزہ آپ دیں!' },
  'Based on %COUNT% reviews': { en: 'Based on %COUNT% reviews', 'ur-roman': '%COUNT% reviews par mabni', ur: '%COUNT% جائزے کی بنیاد پر' },
  'No content found': { en: 'No content found', 'ur-roman': 'Koi content nahi mila', ur: 'کوئی مواد نہیں ملا' },
  'Refresh Library': { en: 'Refresh Library', 'ur-roman': 'Library Refresh Karein', ur: 'لائبریری ریفریش کریں' },
  'Refresh': { en: 'Refresh', 'ur-roman': 'Refresh', ur: 'ریفریش' },
  'Write a Review': { en: 'Write a Review', 'ur-roman': 'Review Likhein', ur: 'جائزہ لکھیں' },
  'Log In to Review': { en: 'Log In to Review', 'ur-roman': 'Review ke liye Log In karein', ur: 'جائزہ کے لیے لاگ ان کریں' },
  'Log in to your account to post a review and get +5 Days free membership!': { en: 'Log in to your account to post a review and get +5 Days free membership!', 'ur-roman': 'Review dene aur muft +5 din ki membership ke liye log in karein!', ur: 'جائزہ پوسٹ کرنے اور مفت 5 دن کی ممبرشپ حاصل کرنے کے لیے لاگ ان کریں!' },
  'Submit Review (+5 Days)': { en: 'Submit Review (+5 Days)', 'ur-roman': 'Review Bhejein (+5 Din)', ur: 'جائزہ جمع کریں (+5 دن)' },
  'Your City (Optional)': { en: 'Your City (Optional)', 'ur-roman': 'Aapka Shahr (Optional)', ur: 'آپ کا شہر (اختیاری)' },
  'Verified Member': { en: 'Verified Member', 'ur-roman': 'Tasdeeq Shuda Member', ur: 'تصدیق شدہ ممبر' },
  'Overall Rating': { en: 'Overall Rating', 'ur-roman': 'Kull Rating', ur: 'مجموعی درجہ بندی' },
  'Reviews & Ratings': { en: 'Reviews & Ratings', 'ur-roman': 'Reviews & Ratings', ur: 'جائزے اور درجہ بندی' },
  'Share your honest experience and earn 5 days of free VIP access!': { en: 'Share your honest experience and earn 5 days of free VIP access!', 'ur-roman': 'Apna sacha tajurba share karein aur 5 din ki muft VIP rasai haasil karein!', ur: 'اپنا سچا تجربہ شیئر کریں اور 5 دن کی مفت VIP رسائی حاصل کریں!' },


  'Share your experience...': { en: 'Share your experience...', 'ur-roman': 'Apna tajurba share karein...', ur: 'اپنا تجربہ شیئر کریں...' },


  'User Reviews': { en: 'User Reviews', 'ur-roman': 'Users ke Reviews', ur: 'صارفین کے جائزے' },
  'See what others are saying about %APP_NAME%': { en: 'See what others are saying about %APP_NAME%', 'ur-roman': 'Dekhein doosray log %APP_NAME% ke baray mein kya kehte hain', ur: 'دیکھیں کہ دوسرے لوگ %APP_NAME% کے بارے میں کیا کہتے ہیں' },


  'Get in touch with the %APP_NAME% team.': { en: 'Get in touch with the %APP_NAME% team.', 'ur-roman': '%APP_NAME% team se rabta karein.', ur: '%APP_NAME% ٹیم سے رابطہ کریں۔' },
  'Have a question or need to request a specific movie? Reach out directly on WhatsApp for fast support.': { en: 'Have a question or need to request a specific movie? Reach out directly on WhatsApp for fast support.', 'ur-roman': 'Koi sawal hai ya kisi makhsoos movie ki request karni hai? Taiz support ke liye direct WhatsApp par rabta karein.', ur: 'کوئی سوال ہے یا کسی مخصوص مووی کی درخواست کرنی ہے؟ تیز سپورٹ کے لیے براہ راست واٹس ایپ پر رابطہ کریں۔' },
  'Chat on WhatsApp': { en: 'Chat on WhatsApp', 'ur-roman': 'WhatsApp par chat karein', ur: 'واٹس ایپ پر چیٹ کریں' },
  'WhatsApp Channel': { en: 'WhatsApp Channel', 'ur-roman': 'WhatsApp Channel', ur: 'واٹس ایپ چینل' },
  'Join our official WhatsApp channel for the latest movie drops, series updates, and exclusive offers.': { en: 'Join our official WhatsApp channel for the latest movie drops, series updates, and exclusive offers.', 'ur-roman': 'Latest movies, series updates, aur exclusive offers ke liye hamara official WhatsApp channel join karein.', ur: 'تازہ ترین موویز، سیریز کی اپ ڈیٹس، اور خصوصی پیشکشوں کے لیے ہمارے آفیشل واٹس ایپ چینل میں شامل ہوں۔' },
  'Join Channel': { en: 'Join Channel', 'ur-roman': 'Channel Join Karein', ur: 'چینل جوائن کریں' },


  'Free Movies in Pakistan?': { en: 'Free Movies in Pakistan?', 'ur-roman': 'Pakistan me Free Movies?', ur: 'پاکستان میں مفت موویز؟' },
  'Get them almost-free — PKR 50 in HD.': { en: 'Get them almost-free — PKR 50 in HD.', 'ur-roman': 'Taqreeban muft haasil karein — sirf PKR 50 mein HD.', ur: 'انہیں تقریباً مفت حاصل کریں — ایچ ڈی میں صرف پچاس روپے میں۔' },
  'Get PKR 50 Movie on WhatsApp': { en: 'Get PKR 50 Movie on WhatsApp', 'ur-roman': 'WhatsApp par PKR 50 ki Movie lein', ur: 'واٹس ایپ پر 50 روپے میں مووی حاصل کریں' },
  'Browse Full Catalog': { en: 'Browse Full Catalog', 'ur-roman': 'Mukammal Catalog dekhein', ur: 'مکمل کیٹلاگ دیکھیں' },
  'Free download sites vs.': { en: 'Free download sites vs.', 'ur-roman': 'Free download sites muqabla', ur: 'مفت ڈاؤن لوڈ سائٹس بمقابلہ' },
  'Why thousands of movie lovers in Pakistan switch to PKR 50 instant delivery': { en: 'Why thousands of movie lovers in Pakistan switch to PKR 50 instant delivery', 'ur-roman': 'Pakistan mein hazaron movie lovers PKR 50 instant delivery par kyun aate hain', ur: 'پاکستان میں ہزاروں فلمی شائقین 50 روپے کی فوری ڈیلیوری کو کیوں ترجیح دیتے ہیں' },
  'Free piracy sites': { en: 'Free piracy sites', 'ur-roman': 'Free piracy sites', ur: 'مفت پائریسی سائٹس' },
  'High risk, slow downloads & viruses': { en: 'High risk, slow downloads & viruses', 'ur-roman': 'Bada risk, slow downloads aur viruses', ur: 'بڑا خطرہ، سست ڈاؤن لوڈ اور وائرس' },
  'Illegal & unsafe': { en: 'Illegal & unsafe', 'ur-roman': 'Ghair kanooni aur ghair mehfooz', ur: 'غیر قانونی اور غیر محفوظ' },
  'Malware, viruses, phishing popups': { en: 'Malware, viruses, phishing popups', 'ur-roman': 'Malware, viruses, phishing popups', ur: 'میلویئر، وائرس، فشنگ پاپ اپ' },
  'VPN required, slow downloads': { en: 'VPN required, slow downloads', 'ur-roman': 'VPN zaroori, slow downloads', ur: 'وی پی این درکار، سست ڈاؤن لوڈ' },
  'Fake "download" buttons, ads everywhere': { en: 'Fake "download" buttons, ads everywhere', 'ur-roman': 'Jaali "download" buttons, har jagah ads', ur: 'جعلی "ڈاؤن لوڈ" بٹن، ہر جگہ اشتہارات' },
  'Poor quality, wrong files, no support': { en: 'Poor quality, wrong files, no support', 'ur-roman': 'Kharab quality, ghalat files, koi support nahi', ur: 'ناقص کوالٹی، غلط فائلیں، کوئی سپورٹ نہیں' },
  'Safe, legal, ad-free': { en: 'Safe, legal, ad-free', 'ur-roman': 'Mehfooz, kanooni, ads ke baghair', ur: 'محفوظ، قانونی، اشتہارات کے بغیر' },
  'Verified HD source, no viruses': { en: 'Verified HD source, no viruses', 'ur-roman': 'Tasdeeq shuda HD source, koi virus nahi', ur: 'تصدیق شدہ ایچ ڈی سورس، کوئی وائرس نہیں' },
  'No VPN — delivered on WhatsApp': { en: 'No VPN — delivered on WhatsApp', 'ur-roman': 'Baghair VPN — WhatsApp par dastyab', ur: 'بغیر وی پی این — واٹس ایپ پر دستیاب' },
  'Only PKR 50 per movie (biscuit price)': { en: 'Only PKR 50 per movie (biscuit price)', 'ur-roman': 'Sirf PKR 50 per movie (biscuit ki qeemat)', ur: 'صرف 50 روپے فی مووی (بسکٹ کی قیمت)' },
  'Real support on WhatsApp': { en: 'Real support on WhatsApp', 'ur-roman': 'WhatsApp par real support', ur: 'واٹس ایپ پر حقیقی سپورٹ' },
  'Trending Now': { en: 'Trending Now', 'ur-roman': 'Aaj kal maqbool', ur: 'آج کل مقبول' },
  'Crystal Clear': { en: 'Crystal Clear', 'ur-roman': 'Bilkul Saaf', ur: 'بالکل صاف' },
  'No Apps Needed': { en: 'No Apps Needed', 'ur-roman': 'Kisi app ki zaroorat nahi', ur: 'کسی ایپ کی ضرورت نہیں' },
  'Instant Delivery': { en: 'Instant Delivery', 'ur-roman': 'Fori Delivery', ur: 'فوری ڈیلیوری' },
  'Virus-Free': { en: 'Virus-Free', 'ur-roman': 'Virus se pak', ur: 'وائرس سے پاک' },
  '4 Easy Steps': { en: '4 Easy Steps', 'ur-roman': '4 Asan steps', ur: '4 آسان مراحل' },
  'How to Get Any Movie for PKR 50': { en: 'How to Get Any Movie for PKR 50', 'ur-roman': 'PKR 50 mein koi bhi movie kaise lein', ur: '50 روپے میں کوئی بھی مووی کیسے حاصل کریں' },
  'Pick any movie': { en: 'Pick any movie', 'ur-roman': 'Koi bhi movie muntakhib karein', ur: 'کوئی بھی مووی منتخب کریں' },
  'Browse our massive library of Bollywood, Hollywood & Lollywood titles.': { en: 'Browse our massive library of Bollywood, Hollywood & Lollywood titles.', 'ur-roman': 'Bollywood, Hollywood aur Lollywood ki bari library dekhein.', ur: 'بالی ووڈ، ہالی ووڈ اور لالی ووڈ کی ہماری بڑی لائبریری دیکھیں۔' },
  'Tap WhatsApp': { en: 'Tap WhatsApp', 'ur-roman': 'WhatsApp dabayein', ur: 'واٹس ایپ پر کلک کریں' },
  'Click the order button to open instant chat with our support team.': { en: 'Click the order button to open instant chat with our support team.', 'ur-roman': 'Hamari support team se chat ke liye order button dabayein.', ur: 'ہماری سپورٹ ٹیم کے ساتھ فوری چیٹ کے لیے آرڈر بٹن پر کلک کریں۔' },
  'Pay PKR 50': { en: 'Pay PKR 50', 'ur-roman': 'PKR 50 pay karein', ur: '50 روپے ادا کریں' },
  'Easily pay via EasyPaisa or JazzCash in 30 seconds.': { en: 'Easily pay via EasyPaisa or JazzCash in 30 seconds.', 'ur-roman': 'EasyPaisa ya JazzCash se 30 seconds mein asani se pay karein.', ur: 'ایزی پیسہ یا جاز کیش کے ذریعے 30 سیکنڈ میں آسانی سے ادائیگی کریں۔' },
  'Watch in Full HD': { en: 'Watch in Full HD', 'ur-roman': 'Full HD mein dekhein', ur: 'فل ایچ ڈی میں دیکھیں' },
  'Get your high-speed Google Drive link directly on WhatsApp!': { en: 'Get your high-speed Google Drive link directly on WhatsApp!', 'ur-roman': 'Apna high-speed Google Drive link direct WhatsApp par haasil karein!', ur: 'اپنا تیز رفتار گوگل ڈرائیو لنک براہ راست واٹس ایپ پر حاصل کریں!' },
  'Pristine HD, Instant WhatsApp Delivery': { en: 'Pristine HD, Instant WhatsApp Delivery', 'ur-roman': 'Behtareen HD, instant WhatsApp delivery', ur: 'بہترین ایچ ڈی، فوری واٹس ایپ ڈیلیوری' },
  'View All': { en: 'View All', 'ur-roman': 'Sabhi dekhein', ur: 'تمام دیکھیں' },
  'PKR 50 HD': { en: 'PKR 50 HD', 'ur-roman': 'PKR 50 HD', ur: '50 روپے ایچ ڈی' },
  'Ready to watch your movie?': { en: 'Ready to watch your movie?', 'ur-roman': 'Apni movie dekhne ke liye tayyar hain?', ur: 'اپنی مووی دیکھنے کے لیے تیار ہیں؟' },
  'Send us the title on WhatsApp and get instant delivery.': { en: 'Send us the title on WhatsApp and get instant delivery.', 'ur-roman': 'WhatsApp par movie ka naam bhejein aur fori delivery lein.', ur: 'واٹس ایپ پر ہمیں نام بھیجیں اور فوری ڈیلیوری حاصل کریں۔' },
  'Order Now - PKR 50': { en: 'Order Now - PKR 50', 'ur-roman': 'Abhi order karein - PKR 50', ur: 'ابھی آرڈر کریں - 50 روپے' },
  'VIP Membership & Pricing': { en: 'VIP Membership & Pricing', 'ur-roman': 'VIP Membership aur Qeemat', ur: 'وی آئی پی ممبرشپ اور قیمتیں' },
  'Instant Activation': { en: 'Instant Activation', 'ur-roman': 'Fori Activation', ur: 'فوری فعال' },
  'Daily Fresh HD Uploads': { en: 'Daily Fresh HD Uploads', 'ur-roman': 'Rozana nayi HD movies', ur: 'روزانہ نئی ایچ ڈی موویز' },
  'Pay Per Title': { en: 'Pay Per Title', 'ur-roman': 'Har movie ka alag pay karein', ur: 'فی عنوان ادائیگی' },
  'Ideal if you just want specific movies or series on demand': { en: 'Ideal if you just want specific movies or series on demand', 'ur-roman': 'Agar aapko makhsoos movies ya series chahiye to behtareen hai', ur: 'اگر آپ کو صرف مخصوص موویز یا سیریز چاہیے تو بہترین ہے' },
  'Single Title': { en: 'Single Title', 'ur-roman': 'Ek Title', ur: 'واحد عنوان' },
  'one-time download': { en: 'one-time download', 'ur-roman': 'ek dafa ka download', ur: 'ایک بار ڈاؤن لوڈ' },
  'Full Season': { en: 'Full Season', 'ur-roman': 'Pura Season', ur: 'مکمل سیزن' },
  'per complete season': { en: 'per complete season', 'ur-roman': 'poore season ke liye', ur: 'فی مکمل سیزن' },
  'All episodes in one pack': { en: 'All episodes in one pack', 'ur-roman': 'Tamam episodes ek pack mein', ur: 'تمام قسطیں ایک پیک میں' },
  'Pristine HD quality': { en: 'Pristine HD quality', 'ur-roman': 'Behtareen HD quality', ur: 'بہترین ایچ ڈی کوالٹی' },
  'Price may vary by size': { en: 'Price may vary by size', 'ur-roman': 'Qeemat size ke hisab se badal sakti hai', ur: 'قیمت سائز کے حساب سے مختلف ہو سکتی ہے' },
  'Priority delivery': { en: 'Priority delivery', 'ur-roman': 'Tareeji delivery', ur: 'ترجیحی ڈیلیوری' },
  'Save up to 44% with VIP Passes': { en: 'Save up to 44% with VIP Passes', 'ur-roman': 'VIP passes se 44% tak bachayein', ur: 'وی آئی پی پاسز کے ساتھ 44% تک بچائیں' },
  'Membership Group': { en: 'Membership Group', 'ur-roman': 'Membership Group', ur: 'ممبرشپ گروپ' },
  'Base monthly rate': { en: 'Base monthly rate', 'ur-roman': 'Buniyaadi mahana rate', ur: 'بنیادی ماہانہ ریٹ' },
  '2 Years VIP Pass': { en: '2 Years VIP Pass', 'ur-roman': '2 Saal ka VIP Pass', ur: '2 سال کا وی آئی پی پاس' },
  'Join 2-Year VIP Pass': { en: 'Join 2-Year VIP Pass', 'ur-roman': '2 Saal ka VIP Pass Join Karein', ur: '2 سال کا وی آئی پی پاس جوائن کریں' },
  'Fresh HD catalog': { en: 'Fresh HD catalog', 'ur-roman': 'Naya HD catalog', ur: 'تازہ ایچ ڈی کیٹلاگ' },
  'Full seasonal releases': { en: 'Full seasonal releases', 'ur-roman': 'Poore seasons releases', ur: 'مکمل سیزنل ریلیز' },
  '1080p HD Quality': { en: '1080p HD Quality', 'ur-roman': '1080p HD Quality', ur: '1080p ایچ ڈی کوالٹی' },
  'Zero compression loss': { en: 'Zero compression loss', 'ur-roman': 'Zero compression loss', ur: 'صفر کوالٹی نقصان' },
  'Priority Support': { en: 'Priority Support', 'ur-roman': 'Tareeji Support', ur: 'ترجیحی سپورٹ' },
  'Dedicated WhatsApp care': { en: 'Dedicated WhatsApp care', 'ur-roman': 'Special WhatsApp support', ur: 'خصوصی واٹس ایپ کیئر' },
  'Our Story & Vision': { en: 'Our Story & Vision', 'ur-roman': 'Hamari Kahaani aur Vision', ur: 'ہماری کہانی اور وژن' },
  'Ad-Free & Virus-Free': { en: 'Ad-Free & Virus-Free', 'ur-roman': 'Ads aur Virus ke baghair', ur: 'اشتہارات اور وائرس سے پاک' },
  'Per HD Movie': { en: 'Per HD Movie', 'ur-roman': 'Har HD movie', ur: 'فی ایچ ڈی مووی' },
  'Why Choose %APP_NAME%?': { en: 'Why Choose %APP_NAME%?', 'ur-roman': '%APP_NAME% Kyun Muntakhib Karein?', ur: '%APP_NAME% کیوں منتخب کریں؟' },
  'Designed for seamless entertainment lovers across Pakistan': { en: 'Designed for seamless entertainment lovers across Pakistan', 'ur-roman': 'Pakistan bhar ke entertainment lovers ke liye banaya gaya', ur: 'پاکستان بھر کے تفریح شائقین کے لیے ڈیزائن کیا گیا' },
  'Original HD Quality': { en: 'Original HD Quality', 'ur-roman': 'Asli HD Quality', ur: 'اصل ایچ ڈی کوالٹی' },
  'High quality 1080p source links directly sent to your phone.': { en: 'High quality 1080p source links directly sent to your phone.', 'ur-roman': 'High quality 1080p links aapke phone par seedhay bheje jate hain.', ur: 'اعلیٰ معیار کی 1080p لنکس براہ راست آپ کے فون پر بھیجی جاتی ہیں۔' },
  'Instant WhatsApp Delivery': { en: 'Instant WhatsApp Delivery', 'ur-roman': 'Fori WhatsApp delivery', ur: 'فوری واٹس ایپ ڈیلیوری' },
  'No slow links, captcha forms, or suspicious redirections.': { en: 'No slow links, captcha forms, or suspicious redirections.', 'ur-roman': 'Koi slow links, captcha forms ya ghalat links nahi.', ur: 'کوئی سست لنکس، کیپچا فارم یا مشکوک صفحات نہیں ہیں۔' },
  'Easy Payment Options': { en: 'Easy Payment Options', 'ur-roman': 'Asan Payment Option', ur: 'آسان ادائیگی کے اختیارات' },
  'Pay conveniently via EasyPaisa or JazzCash.': { en: 'Pay conveniently via EasyPaisa or JazzCash.', 'ur-roman': 'EasyPaisa ya JazzCash se asani se pay karein.', ur: 'ایزی پیسہ یا جاز کیش کے ذریعے آسان ادائیگی کریں۔' },
  'Dedicated Support': { en: 'Dedicated Support', 'ur-roman': 'Dedicated Support', ur: 'خصوصی سپورٹ' },
  'Our team is always online to help you with requests and orders.': { en: 'Our team is always online to help you with requests and orders.', 'ur-roman': 'Hamari team aapki requests aur orders mein madad ke liye online hai.', ur: 'ہماری ٹیم درخواستوں اور آرڈرز میں مدد کے لیے ہمیشہ آن لائن ہوتی ہے۔' },
  '24/7 Instant Support': { en: '24/7 Instant Support', 'ur-roman': '24/7 Fori Support', ur: '24/7 فوری سپورٹ' },
  'Online • Instant Support': { en: 'Online • Instant Support', 'ur-roman': 'Online • Fori Support', ur: 'آن لائن • فوری سپورٹ' },
  'Official Channel': { en: 'Official Channel', 'ur-roman': 'Official Channel', ur: 'آفیشل چینل' },
  'Join Official Channel': { en: 'Join Official Channel', 'ur-roman': 'Official Channel Join Karein', ur: 'آفیشل چینل میں شامل ہوں' },
  '< 3 Minutes': { en: '< 3 Minutes', 'ur-roman': '< 3 Minute', ur: '< 3 منٹ' },
  'Average response time': { en: 'Average response time', 'ur-roman': 'Average jawab ka waqt', ur: 'اوسط ردعمل کا وقت' },
  'Real Support Staff': { en: 'Real Support Staff', 'ur-roman': 'Asli Support Staff', ur: 'حقیقی سپورٹ عملہ' },
  'Friendly human assistance': { en: 'Friendly human assistance', 'ur-roman': 'Dostana insani madad', ur: 'دوستانہ انسانی مدد' },
  '100% Privacy': { en: '100% Privacy', 'ur-roman': '100% Privacy', ur: '100% راز داری' },
  'Your data is never shared': { en: 'Your data is never shared', 'ur-roman': 'Aapka data kabhi share nahi hota', ur: 'آپ کا ڈیٹا کبھی شیئر نہیں کیا جاتا' },
  'Frequently Asked Questions': { en: 'Frequently Asked Questions', 'ur-roman': 'Aam Tor Par Pooche Jane Wale Sawalat', ur: 'اکثر پوچھے گئے سوالات' },
  'How fast will I receive my movie?': { en: 'How fast will I receive my movie?', 'ur-roman': 'Mujhe apni movie kitni jaldi milegi?', ur: 'مجھے میری مووی کتنی جلدی ملے گی؟' },
  'Movies are sent directly to your WhatsApp as soon as payment or request is confirmed — usually within a few minutes.': { en: 'Movies are sent directly to your WhatsApp as soon as payment or request is confirmed — usually within a few minutes.', 'ur-roman': 'Payment ya request ki tasdeeq ke baad movies direct aapke WhatsApp par bhej di jati hain — aam tor par chand mintu mein.', ur: 'ادائیگی یا درخواست کی تصدیق ہوتے ہی موویز براہ راست آپ کے واٹس ایپ پر بھیج دی جاتی ہیں — عام طور پر چند منٹوں میں۔' },
  'Is it safe & virus-free?': { en: 'Is it safe & virus-free?', 'ur-roman': 'Kya ye mehfooz aur virus-free hai?', ur: 'کیا یہ محفوظ اور وائرس سے پاک ہے؟' },
  'Yes! All files are tested and verified in high-definition HD quality with zero popups, viruses, or dangerous ads.': { en: 'Yes! All files are tested and verified in high-definition HD quality with zero popups, viruses, or dangerous ads.', 'ur-roman': 'Haan! Tamam files tasdeeq shuda hain HD quality mein baghair kisi popups, virus ya dangerous ads ke.', ur: 'جی ہاں! تمام فائلوں کو اعلیٰ معیار کی ایچ ڈی کوالٹی میں بغیر کسی پاپ اپس، وائرس یا خطرناک اشتہارات کے ٹیسٹ اور تصدیق کی گئی ہے۔' },


  'Simple, honest pricing': { en: 'Simple, honest pricing', 'ur-roman': 'Saada, imaandarana qeemat', ur: 'سادہ، ایماندارانہ قیمت' },
  'Pay per title, or join the group and get 6–7 fresh HD movies delivered every single day.': { en: 'Pay per title, or join the group and get 6–7 fresh HD movies delivered every single day.', 'ur-roman': 'Har title ka pay karein, ya group join karein aur rozana 6-7 nayi HD movies haasil karein.', ur: 'ہر ٹائٹل کے لیے ادائیگی کریں، یا گروپ میں شامل ہوں اور روزانہ 6 سے 7 نئی ایچ ڈی موویز حاصل کریں۔' },
  'Single Movie': { en: 'Single Movie', 'ur-roman': 'Ek Movie', ur: 'ایک مووی' },
  'one-time': { en: 'one-time', 'ur-roman': 'ek dafa', ur: 'ایک بار' },
  'Any movie in the catalog': { en: 'Any movie in the catalog', 'ur-roman': 'Catalog mein se koi bhi movie', ur: 'کیٹلاگ میں سے کوئی بھی مووی' },
  'Full HD quality': { en: 'Full HD quality', 'ur-roman': 'Full HD quality', ur: 'فل ایچ ڈی کوالٹی' },
  'Delivered on WhatsApp': { en: 'Delivered on WhatsApp', 'ur-roman': 'WhatsApp par bheji jayegi', ur: 'واٹس ایپ پر بھیجی جائے گی' },
  'Same-day delivery': { en: 'Same-day delivery', 'ur-roman': 'Usi din delivery', ur: 'اسی دن ڈیلیوری' },
  'Get on WhatsApp': { en: 'Get on WhatsApp', 'ur-roman': 'WhatsApp par lein', ur: 'واٹس ایپ پر حاصل کریں' },
  'Monthly Group': { en: 'Monthly Group', 'ur-roman': 'Mahana Group', ur: 'ماہانہ گروپ' },
  '/month': { en: '/month', 'ur-roman': '/mah', ur: '/مہینہ' },
  '6-7 fresh HD movies daily': { en: '6-7 fresh HD movies daily', 'ur-roman': 'Rozana 6-7 fresh HD movies', ur: 'روزانہ 6 سے 7 تازہ ایچ ڈی موویز' },
  'Access to premium WhatsApp group': { en: 'Access to premium WhatsApp group', 'ur-roman': 'Premium WhatsApp group tak rasai', ur: 'پریمیم واٹس ایپ گروپ تک رسائی' },
  'Priority requests': { en: 'Priority requests', 'ur-roman': 'Tareeji requests', ur: 'ترجیحی درخواستیں' },
  'No hidden fees': { en: 'No hidden fees', 'ur-roman': 'Koi chupi hui fees nahi', ur: 'کوئی پوشیدہ فیس نہیں' },
  'Join WhatsApp Group': { en: 'Join WhatsApp Group', 'ur-roman': 'WhatsApp Group join karein', ur: 'واٹس ایپ گروپ جوائن کریں' },

  'Your premium destination for HD movies and web series in Pakistan.': { en: 'Your premium destination for HD movies and web series in Pakistan.', 'ur-roman': 'Pakistan mein HD movies aur web series ki behtareen jagah.', ur: 'پاکستان میں ایچ ڈی موویز اور ویب سیریز کے لیے آپ کی پریمیم منزل۔' },
  'Vast Collection': { en: 'Vast Collection', 'ur-roman': 'Bohat bada collection', ur: 'وسيع کلیکشن' },
  'Access thousands of movies and web series from Bollywood, Hollywood, and local cinema in pristine HD quality.': { en: 'Access thousands of movies and web series from Bollywood, Hollywood, and local cinema in pristine HD quality.', 'ur-roman': 'Bollywood, Hollywood, aur local cinema ki hazaron movies aur web series behtareen HD quality mein.', ur: 'بالی ووڈ، ہالی ووڈ اور مقامی سنیما سے ہزاروں فلموں اور ویب سیریز تک بہترین ایچ ڈی کوالٹی میں رسائی حاصل کریں۔' },
  'Safe & Secure': { en: 'Safe & Secure', 'ur-roman': 'Mehfooz', ur: 'محفوظ' },
  'No more sketchy download sites, viruses, or VPNs. We provide direct, safe access to the content you love.': { en: 'No more sketchy download sites, viruses, or VPNs. We provide direct, safe access to the content you love.', 'ur-roman': 'Ab aur koi khatarnak download sites, viruses ya VPN nahi. Hum aapke pasandeeda content tak direct aur mehfooz rasai dete hain.', ur: 'اب کوئی خطرناک ڈاؤن لوڈ سائٹس، وائرس یا وی پی این نہیں۔ ہم آپ کے پسندیدہ مواد تک براہ راست اور محفوظ رسائی فراہم کرتے ہیں۔' },
  'Fast Delivery': { en: 'Fast Delivery', 'ur-roman': 'Tez Delivery', ur: 'تیز ڈیلیوری' },
  'Get your favorite content delivered directly to your WhatsApp instantly. No waiting, no buffering.': { en: 'Get your favorite content delivered directly to your WhatsApp instantly. No waiting, no buffering.', 'ur-roman': 'Apna pasandeeda content foran WhatsApp par haasil karein. Koi intezar nahi, koi buffering nahi.', ur: 'اپنا پسندیدہ مواد فوری طور پر واٹس ایپ پر حاصل کریں۔ کوئی انتظار نہیں، کوئی بفرنگ نہیں۔' },
  'Our Mission': { en: 'Our Mission', 'ur-roman': 'Hamara Maqsad', ur: 'ہمارا مشن' },
  'At %APP_NAME%, we believe entertainment should be accessible, affordable, and safe. For too long, finding a good movie online meant navigating through a maze of popup ads, malware, and broken links.': { en: 'At %APP_NAME%, we believe entertainment should be accessible, affordable, and safe. For too long, finding a good movie online meant navigating through a maze of popup ads, malware, and broken links.', 'ur-roman': 'Hum maante hain ke entertainment asaan, sasta aur mehfooz hona chahiye. Bohat arsay tak achi movie dhoondne ka matlab popup ads, malware aur broken links se guzarna tha.', ur: 'ہمارا ماننا ہے کہ تفریح قابل رسائی، سستی اور محفوظ ہونی چاہیے۔ طویل عرصے تک ایک اچھی فلم آن لائن تلاش کرنے کا مطلب پاپ اپ اشتہارات، میلویئر اور ٹوٹے ہوئے لنکس کے جال سے گزرنا تھا۔' },
  'We\'re changing that by offering a clean, straightforward service. Whether you want to buy a single movie for just PKR 50 or join our membership for daily content, we ensure you get exactly what you pay for — high-quality entertainment without the hassle.': { en: 'We\'re changing that by offering a clean, straightforward service. Whether you want to buy a single movie for just PKR 50 or join our membership for daily content, we ensure you get exactly what you pay for — high-quality entertainment without the hassle.', 'ur-roman': 'Hum is sab ko badal rahe hain ek saaf suthri service ke zariye. Chahe aap 50 rupay mein ek movie khareedein ya daily content ke liye membership lein, hum yaqeen dehani karate hain ke aapko bina kisi masle ke high-quality entertainment milay.', ur: 'ہم ایک صاف ستھری سروس کی پیشکش کر کے اسے تبدیل کر رہے ہیں۔ چاہے آپ صرف 50 روپے میں ایک مووی خریدنا چاہیں یا روزانہ مواد کے لیے ہماری ممبرشپ میں شامل ہوں، ہم یقینی بناتے ہیں کہ آپ کو بغیر کسی پریشانی کے اعلیٰ معیار کی تفریح ملے۔' },

  'Get in Touch': { en: 'Get in Touch', 'ur-roman': 'Rabta Karein', ur: 'رابطہ کریں' },
  'Have a question or need help? We\'re here for you.': { en: 'Have a question or need help? We\'re here for you.', 'ur-roman': 'Koi sawal hai ya madad chahiye? Hum aapke liye hazir hain.', ur: 'کوئی سوال ہے یا مدد چاہیے؟ ہم آپ کے لیے حاضر ہیں۔' },
  'WhatsApp Support': { en: 'WhatsApp Support', 'ur-roman': 'WhatsApp Support', ur: 'واٹس ایپ سپورٹ' },
  'Available 24/7 for fast responses': { en: 'Available 24/7 for fast responses', 'ur-roman': 'Fori jawabaat ke liye 24/7 dastyab', ur: 'فوری جوابات کے لیے 24/7 دستیاب' },
  'Message on WhatsApp': { en: 'Message on WhatsApp', 'ur-roman': 'WhatsApp par message karein', ur: 'واٹس ایپ پر پیغام بھیجیں' },
  'Email Us': { en: 'Email Us', 'ur-roman': 'Email Karein', ur: 'ای میل کریں' },
  'For business inquiries and support': { en: 'For business inquiries and support', 'ur-roman': 'Business inquiries aur support ke liye', ur: 'کاروباری پوچھ گچھ اور تعاون کے لیے' },
  'Send Email': { en: 'Send Email', 'ur-roman': 'Email Bhejein', ur: 'ای میل بھیجیں' },
  'Call Us': { en: 'Call Us', 'ur-roman': 'Call Karein', ur: 'کال کریں' },
  'Available during business hours': { en: 'Available during business hours', 'ur-roman': 'Kaam ke auqaat mein dastyab', ur: 'کاروباری اوقات کے دوران دستیاب' },
  'Call Now': { en: 'Call Now', 'ur-roman': 'Abhi Call Karein', ur: 'ابھی کال کریں' },
  'Office Hours': { en: 'Office Hours', 'ur-roman': 'Office ke Auqaat', ur: 'دفتری اوقات' },
  'Monday - Saturday': { en: 'Monday - Saturday', 'ur-roman': 'Peer - Hafta', ur: 'پیر - ہفتہ' },
  '9:00 AM - 10:00 PM (PKT)': { en: '9:00 AM - 10:00 PM (PKT)', 'ur-roman': 'Subah 9:00 se Raat 10:00 (PKT)', ur: 'صبح 9:00 سے رات 10:00 (PKT)' },
  'Sunday': { en: 'Sunday', 'ur-roman': 'Itwar', ur: 'اتوار' },
  'Closed': { en: 'Closed', 'ur-roman': 'Band', ur: 'بند ہے' },

  'What our users say': { en: 'What our users say', 'ur-roman': 'Hamare users kya kehte hain', ur: 'ہمارے صارفین کیا کہتے ہیں' },
  'Join thousands of satisfied users.': { en: 'Join thousands of satisfied users.', 'ur-roman': 'Hazaron mutma\'een users mein shamil hon.', ur: 'ہزاروں مطمئن صارفین میں شامل ہوں۔' },
  'Your Rating': { en: 'Your Rating', 'ur-roman': 'Aapki Rating', ur: 'آپ کی درجہ بندی' },
  'Your Review': { en: 'Your Review', 'ur-roman': 'Aapka Review', ur: 'آپ کا جائزہ' },
  'Submit Review': { en: 'Submit Review', 'ur-roman': 'Review Bhejein', ur: 'جائزہ جمع کریں' },
  'Update Review': { en: 'Update Review', 'ur-roman': 'Review Update Karein', ur: 'جائزہ اپ ڈیٹ کریں' },
  'Average Rating': { en: 'Average Rating', 'ur-roman': 'Average Rating', ur: 'اوسط درجہ بندی' },
  'No reviews yet. Be the first to share your experience!': { en: 'No reviews yet. Be the first to share your experience!', 'ur-roman': 'Abhi tak koi review nahi. Apna tajurba share karne wale pehle shakhs banein!', ur: 'ابھی تک کوئی جائزہ نہیں۔ اپنا تجربہ شیئر کرنے والے پہلے شخص بنیں!' },

  'Home': { en: 'Home', 'ur-roman': 'Ghar', ur: 'ہوم' },
  'Movie Details': { en: 'Movie Details', 'ur-roman': 'Movie ki tafseel', ur: 'مووی کی تفصیلات' },
  'Cart': { en: 'Cart', 'ur-roman': 'Tohfa', ur: 'کارٹ' },
  'Top Up': { en: 'Top Up', 'ur-roman': 'Top Up', ur: 'ٹاپ اپ' },
  'Alerts': { en: 'Alerts', 'ur-roman': 'Alerts', ur: 'الرٹس' },
  'Settings': { en: 'Settings', 'ur-roman': 'Settings', ur: 'سیٹنگز' },
  'Profile': { en: 'Profile', 'ur-roman': 'Profile', ur: 'پروفائل' },
  'Watch Later': { en: 'Watch Later', 'ur-roman': 'Baad mein dekhein', ur: 'بعد میں دیکھیں' },
  'Favorites': { en: 'Favorites', 'ur-roman': 'Pasandida', ur: 'پسندیدہ' },
  'Search': { en: 'Search', 'ur-roman': 'Talash karein', ur: 'تلاش کریں' },
  'Logout': { en: 'Logout', 'ur-roman': 'Logout', ur: 'لاگ آؤٹ' },
  'Membership': { en: 'Membership', 'ur-roman': 'Membership', ur: 'ممبرشپ' },
  'Synopsis': { en: 'Synopsis', 'ur-roman': 'Khulasa', ur: 'خلاصہ' },
  'Recommended': { en: 'Recommended', 'ur-roman': 'Sifarish karda', ur: 'سفارش کردہ' },
  'Recommended For You': { en: 'Recommended For You', 'ur-roman': 'Aap ke liye sifarishat', ur: 'آپ کے لیے سفارشات' },
  'Handpicked recommendations matching this genre & quality': { en: 'Handpicked recommendations matching this genre & quality', 'ur-roman': 'Is genre aur quality se milti julti sifarishat', ur: 'اس صنف اور معیار سے ملتی جلتی سفارشات' },
  'Recently Viewed': { en: 'Recently Viewed', 'ur-roman': 'Haal hi mein dekha gaya', ur: 'حال ہی میں دیکھا گیا' },
  'Cast': { en: 'Cast', 'ur-roman': 'Cast', ur: 'کاسٹ' },
  'Genre:': { en: 'Genre:', 'ur-roman': 'Asnaf:', ur: 'صنف:' },
  'Language:': { en: 'Language:', 'ur-roman': 'Zuban:', ur: 'زبان:' },
  'Quality:': { en: 'Quality:', 'ur-roman': 'Miyar:', ur: 'معیار:' },
  'Download & Play': { en: 'Download & Play', 'ur-roman': 'Download aur play karein', ur: 'ڈاؤن لوڈ اور پلے' },
  'Genre': { en: 'Genre', 'ur-roman': 'Genre', ur: 'صنف' },
  'Quality': { en: 'Quality', 'ur-roman': 'Miyar', ur: 'معیار' },
  'Movies': { en: 'Movies', 'ur-roman': 'Movies', ur: 'موویز' },
  'Web Series': { en: 'Web Series', 'ur-roman': 'Web Series', ur: 'ویب سیریز' },
  'Free Movies': { en: 'Free Movies', 'ur-roman': 'Muft Movies', ur: 'مفت موویز' },
  'Reviews': { en: 'Reviews', 'ur-roman': 'Reviews', ur: 'جائزے' },
  'Rate our app': { en: 'Rate our app', 'ur-roman': 'Hamari app ko rate karein', ur: 'ہماری ایپ کو ریٹ کریں' },
  'Check Reviews': { en: 'Check Reviews', 'ur-roman': 'Reviews Check Karein', ur: 'جائزے چیک کریں' },
  'About': { en: 'About', 'ur-roman': 'Hamare baaray mein', ur: 'ہمارے بارے میں' },
  'About Us': { en: 'About Us', 'ur-roman': 'Hamare baaray mein', ur: 'ہمارے بارے میں' },
  'Contact Us': { en: 'Contact Us', 'ur-roman': 'Ham se rabta karein', ur: 'ہم سے رابطہ کریں' },
  'Contact': { en: 'Contact', 'ur-roman': 'Rabta', ur: 'رابطہ کریں' },
  'Series': { en: 'Series', 'ur-roman': 'Series', ur: 'سیریز' },
  'Types': { en: 'Types', 'ur-roman': 'Iqsam', ur: 'اقسام' },
  'Genres': { en: 'Genres', 'ur-roman': 'Asnaf', ur: 'اصناف' },
  'Langs': { en: 'Langs', 'ur-roman': 'Zubanain', ur: 'زبانیں' },
  'Years': { en: 'Years', 'ur-roman': 'Saal', ur: 'سال' },
  'Quals': { en: 'Quals', 'ur-roman': 'Miyar', ur: 'معیار' },
  'Search movies & series...': { en: 'Search movies & series...', 'ur-roman': 'Movies aur series talash karein...', ur: 'موویز اور سیریز تلاش کریں...' },
  'Play': { en: 'Play', 'ur-roman': 'Chalaein', ur: 'چلائیں' },
  'Share': { en: 'Share', 'ur-roman': 'Share', ur: 'شیئر' },
  'WhatsApp Number': { en: 'WhatsApp Number', 'ur-roman': 'WhatsApp number', ur: 'واٹس ایپ نمبر' },
  'Add WhatsApp': { en: 'Add WhatsApp', 'ur-roman': 'WhatsApp add karein', ur: 'واٹس ایپ شامل کریں' },
  'Edit WhatsApp': { en: 'Edit WhatsApp', 'ur-roman': 'WhatsApp edit karein', ur: 'واٹس ایپ تبدیل کریں' },
  'Search global library...': { en: 'Search global library...', 'ur-roman': 'Global library talash karein...', ur: 'گلوبل لائبریری تلاش کریں...' },
  'Content not found or unavailable': { en: 'Content not found or unavailable', 'ur-roman': 'Content nahi mila ya dastiyab nahi hai', ur: 'مواد نہیں ملا یا دستیاب نہیں ہے' },
  'This content may have been removed or you don\'t have access to it.': { en: 'This content may have been removed or you don\'t have access to it.', 'ur-roman': 'Shayad ye content khatam kar diya gaya hai ya aapke paas iska access nahi hai.', ur: 'ہوسکتا ہے کہ یہ مواد ہٹا دیا گیا ہو یا آپ کو اس تک رسائی حاصل نہ ہو۔' },
  'Trailer': { en: 'Trailer', 'ur-roman': 'Trailer', ur: 'ٹریلر' },
  'Watch Trailer': { en: 'Watch Trailer', 'ur-roman': 'Trailer dekhein', ur: 'ٹریلر دیکھیں' },
  'Add to Cart': { en: 'Add to Cart', 'ur-roman': 'Cart mein dalein', ur: 'کارٹ میں شامل کریں' },
  'View Cart': { en: 'View Cart', 'ur-roman': 'Cart dekhein', ur: 'کارٹ دیکھیں' },
  'Remove': { en: 'Remove', 'ur-roman': 'Hatayein', ur: 'ہٹائیں' },
  'Back to Home': { en: 'Back to Home', 'ur-roman': 'Ghar wapis jayein', ur: 'ہوم پر واپس جائیں' },
  'Profile Information': { en: 'Profile Information', 'ur-roman': 'Profile ki maloomat', ur: 'پروفائل کی معلومات' },
  'Full Name': { en: 'Full Name', 'ur-roman': 'Pura naam', ur: 'پورا نام' },
  'Email Address': { en: 'Email Address', 'ur-roman': 'Email address', ur: 'ای میل ایڈریس' },
  'Email address cannot be changed.': { en: 'Email address cannot be changed.', 'ur-roman': 'Email address nahi badla ja sakta.', ur: 'ای میل ایڈریس تبدیل نہیں کیا جا سکتا۔' },
  'Contact admin': { en: 'Contact admin', 'ur-roman': 'Admin se rabta karein', ur: 'ایڈمن سے رابطہ کریں' },
  'Required for membership.': { en: 'Required for membership.', 'ur-roman': 'Membership ke liye lazmi hai.', ur: 'ممبرشپ کے لیے ضروری ہے۔' },
  'WhatsApp number is required for support. Click Save again to skip.': { en: 'WhatsApp number is required for support. Click Save again to skip.', 'ur-roman': 'Support ke liye WhatsApp number lazmi hai. Skip karne ke liye dobara Save dabayein.', ur: 'سپورٹ کے لیے واٹس ایپ نمبر درکار ہے۔ چھوڑنے کے لیے دوبارہ محفوظ کریں پر کلک کریں۔' },
  'Change Password': { en: 'Change Password', 'ur-roman': 'Password badlein', ur: 'پاس ورڈ تبدیل کریں' },
  'Create Password': { en: 'Create Password', 'ur-roman': 'Password banayein', ur: 'پاس ورڈ بنائیں' },
  'Current Password': { en: 'Current Password', 'ur-roman': 'Maujuda password', ur: 'موجودہ پاس ورڈ' },
  'New Password': { en: 'New Password', 'ur-roman': 'Naya password', ur: 'نیا پاس ورڈ' },
  'Confirm New Password': { en: 'Confirm New Password', 'ur-roman': 'Naye password ki tasdeeq karein', ur: 'نئے پاس ورڈ کی تصدیق کریں' },
  'Save Changes': { en: 'Save Changes', 'ur-roman': 'Tabdeeliyaan mehfooz karein', ur: 'تبدیلیاں محفوظ کریں' },
  'Profile updated successfully': { en: 'Profile updated successfully', 'ur-roman': 'Profile sahi se update ho gayi', ur: 'پروفائل کامیابی کے ساتھ اپ ڈیٹ ہو گئی' },
  'New passwords do not match': { en: 'New passwords do not match', 'ur-roman': 'Naye password match nahi kar rahe', ur: 'نئے پاس ورڈ مطابقت نہیں رکھتے' },
  'Current password is required to set a new password': { en: 'Current password is required to set a new password', 'ur-roman': 'Naya password rakhne ke liye purana password lazmi hai', ur: 'نیا پاس ورڈ سیٹ کرنے کے لیے موجودہ پاس ورڈ درکار ہے' },
  'Failed to update profile': { en: 'Failed to update profile', 'ur-roman': 'Profile update nahi ho saki', ur: 'پروفائل اپ ڈیٹ کرنے میں ناکامی' },
  'Top Up Membership': { en: 'Top Up Membership', 'ur-roman': 'Membership top up karein', ur: 'ممبرشپ ٹاپ اپ کریں' },
  'Membership Details': { en: 'Membership Details', 'ur-roman': 'Membership ki tafseel', ur: 'ممبرشپ کی تفصیلات' },
  'Duration (Months)': { en: 'Duration (Months)', 'ur-roman': 'Arsa (Mahine)', ur: 'مدت (مہینے)' },
  'You have already a Pending Membership Order. Send Payment Screenshot OR Cancel it for New Order': { en: 'You have already a Pending Membership Order. Send Payment Screenshot OR Cancel it for New Order', 'ur-roman': 'Aap ka ek membership order pending hai. Screenshot bhejein ya cancel karein.', ur: 'آپ کا پہلے ہی ایک ممبرشپ آرڈر زیر التوا ہے۔ پیمنٹ اسکرین شاٹ بھیجیں یا نئے آرڈر کے لیے اسے کینسل کریں' },
  'Your Cart': { en: 'Your Cart', 'ur-roman': 'Aap ka Cart', ur: 'آپ کا کارٹ' },
  'Translating Description...': { en: 'Translating Description...', 'ur-roman': 'Description translate ho rahi hai...', ur: 'تفصیل کا ترجمہ ہو رہا ہے...' },
  'Description': { en: 'Description', 'ur-roman': 'Tafseel', ur: 'تفصیل' },
  'Movie': { en: 'Movie', 'ur-roman': 'Movie', ur: 'مووی' },
  'Your cart is empty. Add Movies and Series (Seasons) from home page and start watching.': { en: 'Your cart is empty. Add Movies and Series (Seasons) from home page and start watching.', 'ur-roman': 'Aap ka cart khali hai. Home page se movies aur series add karein.', ur: 'آپ کا کارٹ خالی ہے۔ ہوم پیج سے موویز اور سیریز شامل کریں۔' },
  'Total Amount': { en: 'Total Amount', 'ur-roman': 'Kul raqam', ur: 'کل رقم' },
  'Payment Details': { en: 'Payment Details', 'ur-roman': 'Payment ki tafseel', ur: 'ادائیگی کی تفصیلات' },
  'Please send the payment to the following account via any of these methods:': { en: 'Please send the payment to the following account via any of these methods:', 'ur-roman': 'Baraye maharbani in tareeqon se payment bhejein:', ur: 'براہ کرم ان طریقوں سے ادائیگی درج ذیل اکاؤنٹ میں بھیجیں:' },
  'After Payment Send Screenshot for Approval': { en: 'After Payment Send Screenshot for Approval', 'ur-roman': 'Payment ke baad screenshot bhejein', ur: 'ادائیگی کے بعد منظوری کے لیے اسکرین شاٹ بھیجیں' },
  'Submit your request for approval': { en: 'Submit your request for approval', 'ur-roman': 'Manzoori ke liye request bhejein', ur: 'منظوری کے لیے اپنی درخواست جمع کروائیں' },
  'Confirm Order': { en: 'Confirm Order', 'ur-roman': 'Order confirm karein', ur: 'آرڈر کی تصدیق کریں' },
  'Confirmed': { en: 'Confirmed', 'ur-roman': 'Tasdeeq shuda', ur: 'تصدیق شدہ' },
  'Send Payment Screenshot': { en: 'Send Payment Screenshot', 'ur-roman': 'Payment screenshot bhejein', ur: 'ادائیگی کا اسکرین شاٹ بھیجیں' },
  'Contact Admin For Order': { en: 'Contact Admin For Order', 'ur-roman': 'Order ke liye admin se rabta karein', ur: 'آرڈر کے لیے ایڈمن سے رابطہ کریں' },
  'Processing...': { en: 'Processing...', 'ur-roman': 'Intezar karein...', ur: 'پروسیسنگ...' },
  'Invalid Phone Number': { en: 'Invalid Phone Number', 'ur-roman': 'Ghalat phone number', ur: 'غلط فون نمبر' },
  'Please enter a valid WhatsApp number': { en: 'Please enter a valid WhatsApp number', 'ur-roman': 'Sahi WhatsApp number dalein', ur: 'براہ کرم ایک درست واٹس ایپ نمبر درج کریں' },
  'Error': { en: 'Error', 'ur-roman': 'Ghalti', ur: 'غلطی' },
  'Failed to create order. Please try again.': { en: 'Failed to create order. Please try again.', 'ur-roman': 'Order nahi ban saka. Dobara koshish karein.', ur: 'آرڈر بنانے میں ناکامی۔ براہ کرم دوبارہ کوشش کریں۔' },
  'Close': { en: 'Close', 'ur-roman': 'Band karein', ur: 'بند کریں' },
  'Confirm': { en: 'Confirm', 'ur-roman': 'Tasdeeq karein', ur: 'تصدیق کریں' },
  'OK': { en: 'OK', 'ur-roman': 'Theek hai', ur: 'ٹھیک ہے' },
  'Your Watch Later list is empty': { en: 'Your Watch Later list is empty', 'ur-roman': 'Aap ki Watch Later list khali hai', ur: 'آپ کی واچ لیٹر لسٹ خالی ہے' },
  'Your Favorites list is empty': { en: 'Your Favorites list is empty', 'ur-roman': 'Aap ki pasandida list khali hai', ur: 'آپ کی پسندیدہ لسٹ خالی ہے' },
  'Account Pending': { en: 'Account Pending', 'ur-roman': 'Account Pending', ur: 'اکاؤنٹ پینڈنگ' },
  'Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.': { en: 'Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.', 'ur-roman': 'Aap ka account activation pending hai. Please Membership lein ya content cart mein add karein.', ur: 'آپ کے اکاؤنٹ کی فعالیت زیر التواء ہے۔ براہ کرم ممبرشپ حاصل کریں یا اپنے اکاؤنٹ کو فعال کرنے کے لیے کارٹ میں کوئی بھی مواد شامل کریں۔' },
  'Get Membership': { en: 'Get Membership', 'ur-roman': 'Membership lein', ur: 'ممبرشپ حاصل کریں' },
  'Scroll down to add specific seasons to your cart.': { en: 'Scroll down to add specific seasons to your cart.', 'ur-roman': 'Seasons cart mein add karne ke liye neechay scroll karein.', ur: 'مخصوص سیزن اپنے کارٹ میں شامل کرنے کے لیے نیچے اسکرول کریں۔' },
  'Need help or want to renew membership?': { en: 'Need help or want to renew membership?', 'ur-roman': 'Kya aap ko madad chahiye ya membership renew karni hai?', ur: 'مدد کی ضرورت ہے یا ممبرشپ کی تجدید کرنا چاہتے ہیں؟' },
  'Need help or want to report an issue with this content?': { en: 'Need help or want to report an issue with this content?', 'ur-roman': 'Kya aapko madad chahiye ya is content ke mutaliq report karna hai?', ur: 'کیا آپ کو مدد کی ضرورت ہے یا اس مواد سے متعلق کوئی مسئلہ رپورٹ کرنا چاہتے ہیں؟' },
  'Need help? Reach out to our support or join our community.': { en: 'Need help? Reach out to our support or join our community.', 'ur-roman': 'Madad chahiye? Humare support se rabta karein ya community join karein.', ur: 'مدد چاہیے؟ ہمارے سپورٹ سے رابطہ کریں یا ہماری کمیونٹی میں شامل ہوں۔' },
  'Join WhatsApp Channel': { en: 'Join WhatsApp Channel', 'ur-roman': 'WhatsApp Channel join karein', ur: 'واٹس ایپ چینل جوائن کریں' },
  'Content Issue:': { en: 'Content Issue:', 'ur-roman': 'Content ka Masla:', ur: 'مواد کا مسئلہ:' },
  'I need help with this content.': { en: 'I need help with this content.', 'ur-roman': 'Mujhe is content ke hawale se madad chahiye.', ur: 'مجھے اس مواد کے حوالے سے مدد کی ضرورت ہے۔' },
  'if needed.': { en: 'if needed.', 'ur-roman': 'agar zaroorat ho.', ur: 'اگر ضرورت ہو۔' },
  'Content Locked': { en: 'Content Locked', 'ur-roman': 'Content Locked hai', ur: 'مواد مقفل ہے' },
  'You don\'t have access to this content. Contact Admin.': { en: 'You don\'t have access to this content. Contact Admin.', 'ur-roman': 'Aap ke paas is content ka access nahi hai. Admin se rabta karein.', ur: 'آپ کو اس مواد تک رسائی حاصل نہیں ہے۔ ایڈمن سے رابطہ کریں۔' },
  'Trial Expired': { en: 'Trial Expired', 'ur-roman': 'Trial Expired', ur: 'ٹرائل کی میعاد ختم' },
  'Your free Trial has expired. Please get Membership to continue watching.': { en: 'Your free Trial has expired. Please get Membership to continue watching.', 'ur-roman': 'Aap ka free trial khatam ho gaya hai. Dekhna jari rakhne ke liye Membership lein.', ur: 'آپ کا مفت ٹرائل ختم ہو گیا ہے۔ دیکھنا جاری رکھنے کے لیے براہ کرم ممبرشپ حاصل کریں۔' },
  'Membership Expired': { en: 'Membership Expired', 'ur-roman': 'Membership Expired', ur: 'ممبرشپ کی میعاد ختم' },
  'Your Membership has expired. Please Renew or Top Up to continue watching.': { en: 'Your Membership has expired. Please Renew or Top Up to continue watching.', 'ur-roman': 'Aap ki membership khatam ho gayi hai. Dekhna jari rakhne ke liye Renew ya Top Up karein.', ur: 'آپ کی ممبرشپ کی میعاد ختم ہو گئی ہے۔ دیکھنا جاری رکھنے کے لیے براہ کرم تجدید کریں یا ٹاپ اپ کریں۔' },
  'Your membership has expired. Please renew to continue watching.': { en: 'Your membership has expired. Please renew to continue watching.', 'ur-roman': 'Aap ki membership khatam ho gayi hai. Dekhna jari rakhne ke liye Renew karein.', ur: 'آپ کی ممبرشپ کی میعاد ختم ہو گئی ہے۔ دیکھنا جاری رکھنے کے لیے براہ کرم تجدید کریں۔' },
  'Buy Membership': { en: 'Buy Membership', 'ur-roman': 'Membership khareedein', ur: 'ممبرشپ خریدیں' },
  'Renew Now': { en: 'Renew Now', 'ur-roman': 'Abhi Renew karein', ur: 'ابھی تجدید کریں' },
  'Trending': { en: 'Trending', 'ur-roman': 'Trending', ur: 'ٹرینڈنگ' },
  'Newly Added': { en: 'Newly Added', 'ur-roman': 'Naya Shamil Shuda', ur: 'نیا شامل شدہ' },
  'Collections': { en: 'Collections', 'ur-roman': 'Majmuay', ur: 'مجموعے' },
  'Default Order': { en: 'Default Order', 'ur-roman': 'Default Tarteeb', ur: 'ڈیفالٹ ترتیب' },
  'Release Year': { en: 'Release Year', 'ur-roman': 'Release ka Saal', ur: 'ریلیز کا سال' },
  'A-Z': { en: 'A-Z', 'ur-roman': 'A-Z', ur: 'الف ب' },
  'Contact Admin': { en: 'Contact Admin', 'ur-roman': 'Admin se Rabta', ur: 'ایڈمن سے رابطہ کریں' },

  'Unknown': { en: 'Unknown', 'ur-roman': 'Na-maloom', ur: 'نامعلوم' },

  'I tried to activate a trial but saw that it is disabled on the direct link. Please help me get a trial or membership.': { en: 'I tried to activate a trial but saw that it is disabled on the direct link. Please help me get a trial or membership.', 'ur-roman': 'Maine trial activate karne ki koshish ki par direct link disable hai. Bara-e-maharbani trial ya membership lene mein madad karein.', ur: 'میں نے ٹرائل ایکٹیویٹ کرنے کی کوشش کی لیکن ڈائریکٹ لنک پر یہ غیر فعال ہے۔ براہ کرم مجھے ٹرائل یا ممبرشپ حاصل کرنے میں مدد کریں۔' },


  'I need help logging in.': { en: 'I need help logging in.', 'ur-roman': 'Mujhe login karne mein madad chahiye.', ur: 'مجھے لاگ ان کرنے میں مدد چاہیے۔' },
  'I forgot my password and need help resetting it.': { en: 'I forgot my password and need help resetting it.', 'ur-roman': 'Main apna password bhool gaya hoon aur reset karne mein madad chahiye.', ur: 'میں اپنا پاس ورڈ بھول گیا ہوں اور اسے ری سیٹ کرنے میں مدد کی ضرورت ہے۔' },
  'I need to change my email address.': { en: 'I need to change my email address.', 'ur-roman': 'Mujhe apna email address tabdeel karna hai.', ur: 'مجھے اپنا ای میل ایڈریس تبدیل کرنا ہے۔' },
  'Your new email:': { en: 'Your new email:', 'ur-roman': 'Aap ka naya email:', ur: 'آپ کا نیا ای میل:' },
  'I need this movie link.': { en: 'I need this movie link.', 'ur-roman': 'Mujhe is movie ka link chahiye.', ur: 'مجھے اس فلم کا لنک چاہیے۔' },
  'My account is pending and I need assistance.': { en: 'My account is pending and I need assistance.', 'ur-roman': 'Mera account pending hai aur mujhe madad chahiye.', ur: 'میرا اکاؤنٹ زیر التوا ہے اور مجھے مدد کی ضرورت ہے۔' },
  'I am seeing the Not Available screen.': { en: 'I am seeing the Not Available screen.', 'ur-roman': 'Mujhe Not Available screen nazar aa rahi hai.', ur: 'مجھے دستیاب نہیں اسکرین نظر آ رہی ہے۔' },


  'I need help or want to renew my membership.': { en: 'I need help or want to renew my membership.', 'ur-roman': 'Mujhe madad chahiye ya apni membership renew karni hai.', ur: 'مجھے مدد چاہیے یا میں اپنی ممبرشپ کی تجدید کرنا چاہتا ہوں۔' },


  'Please approve my membership top-up. Order ID:': { en: 'Please approve my membership top-up. Order ID:', 'ur-roman': 'Meri membership top-up approve karein. Order ID:', ur: 'براہ کرم میرا ممبرشپ ٹاپ اپ منظور کریں۔ آرڈر کی شناخت:' },
  'Months:': { en: 'Months:', 'ur-roman': 'Mahine:', ur: 'مہینے:' },

  'N/A': { en: 'N/A', 'ur-roman': 'N/A', ur: 'N/A' },


  'Admin': { en: 'Admin', 'ur-roman': 'Admin', ur: 'ایڈمن' },

  'Open in Telegram': { en: 'Open in Telegram', 'ur-roman': 'Telegram mein Kholein', ur: 'ٹیلیگرام میں کھولیں' },
  'Telegram Link Error': { en: 'Telegram Link Error', 'ur-roman': 'Telegram Link Error', ur: 'ٹیلیگرام لنک کی خامی' },
  'An error occurred fetching Telegram link': { en: 'An error occurred fetching Telegram link', 'ur-roman': 'Telegram link fetch karne mein error aaya', ur: 'ٹیلیگرام لنک لاتے وقت ایک خامی پیش آگئی' },

  'Locked': { en: 'Locked', 'ur-roman': 'Locked', ur: 'مقفل' },
  'Pending': { en: 'Pending', 'ur-roman': 'Baaki', ur: 'زیر التوا' },
  'Restricted': { en: 'Restricted', 'ur-roman': 'Mehdood', ur: 'محدود' },
  'Add to Favorites': { en: 'Add to Favorites', 'ur-roman': 'Pasandida mein dalein', ur: 'پسندیدہ میں شامل کریں' },
  'Remove from Favorites': { en: 'Remove from Favorites', 'ur-roman': 'Pasandida se hatayein', ur: 'پسندیدہ سے ہٹائیں' },
  'Add to Watch Later': { en: 'Add to Watch Later', 'ur-roman': 'Baad mein dekhne ke liye dalein', ur: 'بعد میں دیکھیں میں شامل کریں' },
  'Remove from Watch Later': { en: 'Remove from Watch Later', 'ur-roman': 'Baad mein dekhne se hatayein', ur: 'بعد میں دیکھیں سے ہٹائیں' },
  'No Internet Connection': { en: 'No Internet Connection', 'ur-roman': 'Internet nahi hai', ur: 'انٹرنیٹ کنکشن نہیں ہے' },
  'You are currently offline and we don\'t have any cached data to show you. Please connect to the internet and try again.': { en: 'You are currently offline and we don\'t have any cached data to show you. Please connect to the internet and try again.', 'ur-roman': 'Aap offline hain aur humare paas cache data nahi hai. Internet connect karein.', ur: 'آپ فی الحال آف لائن ہیں اور ہمارے پاس آپ کو دکھانے کے لیے کوئی کیشڈ ڈیٹا نہیں ہے۔ براہ کرم انٹرنیٹ سے جڑیں اور دوبارہ کوشش کریں۔' },
  'Try Again': { en: 'Try Again', 'ur-roman': 'Dobara koshish karein', ur: 'دوبارہ کوشش کریں' },
  'Offline Mode': { en: 'Offline Mode', 'ur-roman': 'Offline Mode', ur: 'آف لائن موڈ' },
  'Updating data...': { en: 'Updating data...', 'ur-roman': 'Data update ho raha hai...', ur: 'ڈیٹا اپ ڈیٹ ہو رہا ہے...' },
  'Data is up to date': { en: 'Data is up to date', 'ur-roman': 'Data up to date hai', ur: 'ڈیٹا اپ ٹو ڈیٹ ہے' },
  'Data updated successfully': { en: 'Data updated successfully', 'ur-roman': 'Data sahi se update ho gaya', ur: 'ڈیٹا کامیابی سے اپ ڈیٹ ہو گیا' },
  'Data is not up to date': { en: 'Data is not up to date', 'ur-roman': 'Data up to date nahi hai', ur: 'ڈیٹا اپ ٹو ڈیٹ نہیں ہے' },
  'Please connect to the internet to update your app data and continue.': { en: 'Please connect to the internet to update your app data and continue.', 'ur-roman': 'Apna data update karne ke liye internet connect karein.', ur: 'اپنا ایپ ڈیٹا اپ ڈیٹ کرنے اور جاری رکھنے کے لیے براہ کرم انٹرنیٹ سے جڑیں۔' },
  'You have been offline for over 30 hours. Data was last synced on': { en: 'You have been offline for over 30 hours. Data was last synced on', 'ur-roman': 'Aap 30 ghantay se offline hain. Akhri baar sync hua tha:', ur: 'آپ 30 گھنٹے سے زیادہ وقت سے آف لائن ہیں۔ ڈیٹا آخری بار اس وقت سنک ہوا تھا:' },
  'Hello Admin': { en: 'Hello Admin', 'ur-roman': 'Hello Admin', ur: 'ہیلو ایڈمن' },
  'Assalam O Alaikum! Admin': { en: 'Assalam O Alaikum! Admin', 'ur-roman': 'Assalam O Alaikum! Admin', ur: 'اسلام علیکم! ایڈمن' },
  'Name': { en: 'Name', 'ur-roman': 'Naam', ur: 'نام' },
  'Email': { en: 'Email', 'ur-roman': 'Email', ur: 'ای میل' },
  'Phone': { en: 'Phone', 'ur-roman': 'Phone', ur: 'فون' },
  'Role & Status': { en: 'Role & Status', 'ur-roman': 'Role aur Status', ur: 'کردار اور حیثیت' },
  'Your message/question:': { en: 'Your message/question:', 'ur-roman': 'Aap ka sawal:', ur: 'آپ کا پیغام/سوال:' },
  'Please approve my order. Order ID:': { en: 'Please approve my order. Order ID:', 'ur-roman': 'Mera order approve karein. Order ID:', ur: 'براہ کرم میرا آرڈر منظور کریں۔ آرڈر آئی ڈی:' },
  'Items': { en: 'Items', 'ur-roman': 'Items', ur: 'آئٹمز' },
  'Total Amount: Rs': { en: 'Total Amount: Rs', 'ur-roman': 'Kul raqam: Rs', ur: 'کل رقم: روپے' },
  'My': { en: 'My', 'ur-roman': 'Mera/Meri', ur: 'میرا' },
  'has expired and I need assistance.': { en: 'has expired and I need assistance.', 'ur-roman': 'khatam ho gaya hai aur mujhe madad chahiye.', ur: 'ختم ہو گیا ہے اور مجھے مدد کی ضرورت ہے۔' },
  'Trial': { en: 'Trial', 'ur-roman': 'Trial', ur: 'ٹرائل' },
  'Activate Trial': { en: 'Activate Trial', 'ur-roman': 'Trial active karein', ur: 'ٹرائل فعال کریں' },
  'Activating Trial': { en: 'Activating Trial', 'ur-roman': 'Trial active ho raha hai', ur: 'ٹرائل کو فعال کیا جا رہا ہے' },
  'Activating your trial...': { en: 'Activating your trial...', 'ur-roman': 'Trial active ho raha hai...', ur: 'آپ کا ٹرائل فعال کیا جا رہا ہے...' },
  'Sorry we are not giving Trial on direct link. Please contact admin.': { en: 'Sorry we are not giving Trial on direct link. Please contact admin.', 'ur-roman': 'Direct link se trial nahi mil sakta. Admin se rabta karein.', ur: 'معذرت، ہم براہ راست لنک پر ٹرائل نہیں دے رہے ہیں۔ براہ کرم ایڈمن سے رابطہ کریں۔' },
  'You already have an active trial.': { en: 'You already have an active trial.', 'ur-roman': 'Aap ka trial pehle se active hai.', ur: 'آپ کے پاس پہلے سے ہی ایک فعال ٹرائل ہے۔' },
  'Your account is already active. Trial is only for new pending members.': { en: 'Your account is already active. Trial is only for new pending members.', 'ur-roman': 'Aap ka account pehle se active hai. Trial sirf naye members ke liye hai.', ur: 'آپ کا اکاؤنٹ پہلے ہی فعال ہے۔ ٹرائل صرف نئے زیر التوا اراکین کے لیے ہے۔' },
  'Trial is only available for new pending accounts.': { en: 'Trial is only available for new pending accounts.', 'ur-roman': 'Trial sirf naye pending accounts ke liye dastiyab hai.', ur: 'ٹرائل صرف نئے زیر التواء اکاؤنٹس کے لیے دستیاب ہے۔' },
  'Please add your WhatsApp number to activate your trial.': { en: 'Please add your WhatsApp number to activate your trial.', 'ur-roman': 'Trial active karne ke liye WhatsApp number add karein.', ur: 'اپنا ٹرائل فعال کرنے کے لیے براہ کرم اپنا واٹس ایپ نمبر شامل کریں۔' },
  'WhatsApp Number Required': { en: 'WhatsApp Number Required', 'ur-roman': 'WhatsApp Number Lazmi Hai', ur: 'واٹس ایپ نمبر درکار ہے' },
  'We need your WhatsApp number to verify your trial and provide support.': { en: 'We need your WhatsApp number to verify your trial and provide support.', 'ur-roman': 'Humein aap ke WhatsApp number ki zaroorat hai.', ur: 'ہمیں آپ کے ٹرائل کی تصدیق اور مدد فراہم کرنے کے لیے آپ کے واٹس ایپ نمبر کی ضرورت ہے۔' },
  'Save & Activate Trial': { en: 'Save & Activate Trial', 'ur-roman': 'Save aur active karein', ur: 'محفوظ کریں اور ٹرائل فعال کریں' },
  'Success!': { en: 'Success!', 'ur-roman': 'Kamyabi!', ur: 'کامیابی!' },
  'Trial activated successfully! Enjoy 48 hours of access.': { en: 'Trial activated successfully! Enjoy 48 hours of access.', 'ur-roman': 'Trial active ho gaya! 48 ghantay tak access enjoy karein.', ur: 'ٹرائل کامیابی کے ساتھ فعال ہو گیا! 48 گھنٹے کی رسائی کا لطف اٹھائیں۔' },
  'Redirecting to home...': { en: 'Redirecting to home...', 'ur-roman': 'Home par wapis ja rahe hain...', ur: 'ہوم پر واپس جا رہے ہیں...' },
  'Cannot Activate Trial': { en: 'Cannot Activate Trial', 'ur-roman': 'Trial active nahi ho sakta', ur: 'ٹرائل کو فعال نہیں کیا جا سکتا' },
  'Failed to activate trial. Please try again.': { en: 'Failed to activate trial. Please try again.', 'ur-roman': 'Trial active nahi ho saka. Dobara koshish karein.', ur: 'ٹرائل فعال کرنے میں ناکامی۔ براہ کرم دوبارہ کوشش کریں۔' },
  'Trial Disabled': { en: 'Trial Disabled', 'ur-roman': 'Trial Disabled Hai', ur: 'ٹرائل غیر فعال ہے' },
  'Contact Admin (WhatsApp)': { en: 'Contact Admin (WhatsApp)', 'ur-roman': 'Admin se Rabta karein (WhatsApp)', ur: 'ایڈمن سے رابطہ کریں (واٹس ایپ)' },
  'Go to Home': { en: 'Go to Home', 'ur-roman': 'Home par jayein', ur: 'ہوم پر جائیں' },
  'Redirecting in': { en: 'Redirecting in', 'ur-roman': 'Redirect ho raha hai', ur: 'ری ڈائریکٹ ہو رہا ہے' },
  'seconds...': { en: 'seconds...', 'ur-roman': 'seconds mein...', ur: 'سیکنڈ میں...' },
  'Redirecting to home in': { en: 'Redirecting to home in', 'ur-roman': 'Home par ja rahe hain', ur: 'ہوم پر واپس جا رہے ہیں' },
  'Please enter a valid WhatsApp number with correct length': { en: 'Please enter a valid WhatsApp number with correct length', 'ur-roman': 'Sahi length wala WhatsApp number dalein.', ur: 'براہ کرم درست لمبائی کے ساتھ ایک درست واٹس ایپ نمبر درج کریں' },
  'Failed to save WhatsApp number. Please try again.': { en: 'Failed to save WhatsApp number. Please try again.', 'ur-roman': 'WhatsApp number save nahi ho saka. Dobara koshish karein.', ur: 'واٹس ایپ نمبر محفوظ کرنے میں ناکامی۔ براہ کرم دوبارہ کوشش کریں۔' },
  'Report Broken Link': { en: 'Report Broken Link', 'ur-roman': 'Kharab Link Ki Report Karein', ur: 'خراب لنک کی رپورٹ کریں' },
  'Are you sure you want to report this link as broken or not working? Our team will check and update it.': { en: 'Are you sure you want to report this link as broken or not working? Our team will check and update it.', 'ur-roman': 'Kya aap yaqeenan is link ki kharab hone ki report karna chahte hain? Humari team isko check karke update karegi.', ur: 'کیا آپ واقعی اس لنک کے خراب ہونے کی رپورٹ کرنا چاہتے ہیں؟ ہماری ٹیم اس کی جانچ کرے گی اور اسے اپ ڈیٹ کرے گی۔' },

  // Home Sections & Navigation
  'Curated Collections': { en: 'Curated Collections', 'ur-roman': 'Khas Collections', ur: 'منتخب مجموعے' },
  'Coming Soon': { en: 'Coming Soon', 'ur-roman': 'Jald Aa Raha Hai', ur: 'جلد آرہا ہے' },
  'OTT Releases': { en: 'OTT Releases', 'ur-roman': 'OTT Releases', ur: 'او ٹی ٹی ریلیز' },
  'All': { en: 'All', 'ur-roman': 'Sab', ur: 'سب' },
  'Continue where you left off': { en: 'Continue where you left off', 'ur-roman': 'Jahan chora tha wahan se jari rakhein', ur: 'جہاں چھوڑا تھا وہاں سے جاری رکھیں' },
  'Explore Catalog': { en: 'Explore Catalog', 'ur-roman': 'Catalog Dekhein', ur: 'کیٹلاگ دیکھیں' },
  'Refresh Catalog': { en: 'Refresh Catalog', 'ur-roman': 'Catalog Refresh Karein', ur: 'کیٹلاگ ریفریش کریں' },
  'Catalog refreshed successfully!': { en: 'Catalog refreshed successfully!', 'ur-roman': 'Catalog refresh ho gaya!', ur: 'کیٹلاگ ریفریش ہو گیا!' },
  'New content loaded!': { en: 'New content loaded!', 'ur-roman': 'Naya content load ho gaya!', ur: 'نیا مواد لوڈ ہو گیا!' },
  'content updated': { en: 'content updated', 'ur-roman': 'content update ho gaya', ur: 'مواد اپ ڈیٹ ہو گیا' },
  'Recently Added': { en: 'Recently Added', 'ur-roman': 'Naya Shamil Shuda', ur: 'نیا شامل شدہ' },
  'Collapse Recently Viewed': { en: 'Collapse Recently Viewed', 'ur-roman': 'Recently Viewed chupayein', ur: 'حالیہ دیکھا گیا بند کریں' },
  'Expand Recently Viewed': { en: 'Expand Recently Viewed', 'ur-roman': 'Recently Viewed kholein', ur: 'حالیہ دیکھا گیا کھولیں' },
  'Collapse Trending Now': { en: 'Collapse Trending Now', 'ur-roman': 'Trending chupayein', ur: 'ٹرینڈنگ بند کریں' },
  'Expand Trending Now': { en: 'Expand Trending Now', 'ur-roman': 'Trending kholein', ur: 'ٹرینڈنگ کھولیں' },
  'Collapse Newly Added': { en: 'Collapse Newly Added', 'ur-roman': 'Newly Added chupayein', ur: 'نیا شامل شدہ بند کریں' },
  'Expand Newly Added': { en: 'Expand Newly Added', 'ur-roman': 'Newly Added kholein', ur: 'نیا شامل شدہ کھولیں' },
  'Collapse Collections': { en: 'Collapse Collections', 'ur-roman': 'Collections chupayein', ur: 'مجموعے بند کریں' },
  'Expand Collections': { en: 'Expand Collections', 'ur-roman': 'Collections kholein', ur: 'مجموعے کھولیں' },
  'Collapse Coming Soon': { en: 'Collapse Coming Soon', 'ur-roman': 'Coming Soon chupayein', ur: 'جلد آرہا ہے بند کریں' },
  'Expand Coming Soon': { en: 'Expand Coming Soon', 'ur-roman': 'Coming Soon kholein', ur: 'جلد آرہا ہے کھولیں' },
  'Newest First': { en: 'Newest First', 'ur-roman': 'Naya Pehle', ur: 'نیا پہلے' },
  'Previous': { en: 'Previous', 'ur-roman': 'Peechay', ur: 'پچھلا' },
  'Next': { en: 'Next', 'ur-roman': 'Aagay', ur: 'اگلا' },
  'No content in this collection': { en: 'No content in this collection', 'ur-roman': 'Is collection mein koi content nahi hai', ur: 'اس مجموعے میں کوئی مواد نہیں ہے' },

  // Coming Soon & Media Gallery
  'days left': { en: 'days left', 'ur-roman': 'din baqi', ur: 'دن باقی' },
  'DAYS LEFT': { en: 'DAYS LEFT', 'ur-roman': 'DIN BAQI', ur: 'دن باقی' },
  'Tomorrow': { en: 'Tomorrow', 'ur-roman': 'Kal', ur: 'کل' },
  'Releasing Today': { en: 'Releasing Today', 'ur-roman': 'Aaj release ho rahi hai', ur: 'آج ریلیز ہو رہی ہے' },
  'OTT Date TBA': { en: 'OTT Date TBA', 'ur-roman': 'OTT Tareekh Jald Batayi Jayegi', ur: 'او ٹی ٹی تاریخ جلد متوقع' },
  'Upcoming digital & OTT releases starting from today': { en: 'Upcoming digital & OTT releases starting from today', 'ur-roman': 'Aaj se shuru hone wali digital aur OTT releases', ur: 'آج سے شروع ہونے والی ڈیجیٹل اور او ٹی ٹی ریلیز' },
  'All upcoming digital titles in this category are already available in HD print in our library!': { en: 'All upcoming digital titles in this category are already available in HD print in our library!', 'ur-roman': 'Is category ke tamam aane wale digital titles pehle hi hamari library mein HD print mein dastyab hain!', ur: 'اس زمرے کے تمام آنے والے ڈیجیٹل عنوانات ہماری لائبریری میں ایچ ڈی پرنٹ میں پہلے ہی دستیاب ہیں!' },
  'No upcoming releases found at this moment.': { en: 'No upcoming releases found at this moment.', 'ur-roman': 'Is waqt koi aane wali releases nahi milin.', ur: 'اس وقت کوئی آنے والی ریلیز نہیں ملیں۔' },
  'Failed to fetch upcoming titles from TMDB.': { en: 'Failed to fetch upcoming titles from TMDB.', 'ur-roman': 'TMDB se aane wale titles haasil karne mein nakami hui.', ur: 'TMDB سے آنے والے عنوانات حاصل کرنے میں ناکامی ہوئی۔' },
  'No Poster': { en: 'No Poster', 'ur-roman': 'Poster Nahi Hai', ur: 'کوئی پوسٹر نہیں' },
  'Media & Official Gallery': { en: 'Media & Official Gallery', 'ur-roman': 'Media aur Official Gallery', ur: 'میڈیا اور آفیشل گیلری' },
  'posters & images': { en: 'posters & images', 'ur-roman': 'posters aur images', ur: 'پوسٹرز اور تصاویر' },
  'Click any image to view fullscreen': { en: 'Click any image to view fullscreen', 'ur-roman': 'Fullscreen dekhne ke liye kisi bhi tasveer par click karein', ur: 'فل اسکرین دیکھنے کے لیے کسی بھی تصویر پر کلک کریں' },
  'View HD': { en: 'View HD', 'ur-roman': 'HD Dekhein', ur: 'ایچ ڈی دیکھیں' },
  'Fullscreen': { en: 'Fullscreen', 'ur-roman': 'Fullscreen', ur: 'فل اسکرین' },
  'Detecting OTT Platform...': { en: 'Detecting OTT Platform...', 'ur-roman': 'OTT Platform talash ho raha hai...', ur: 'او ٹی ٹی پلیٹ فارم تلاش کیا جا رہا ہے...' },
  'Share Title': { en: 'Share Title', 'ur-roman': 'Title Share Karein', ur: 'عنوان شیئر کریں' },
  'Share Content': { en: 'Share Content', 'ur-roman': 'Content Share Karein', ur: 'مواد شیئر کریں' },
  'Share Text': { en: 'Share Text', 'ur-roman': 'Text Share Karein', ur: 'ٹیکسٹ شیئر کریں' },
  'Copy Text': { en: 'Copy Text', 'ur-roman': 'Text Copy Karein', ur: 'ٹیکسٹ کاپی کریں' },
  'Share Both': { en: 'Share Both', 'ur-roman': 'Dono Share Karein', ur: 'دونوں شیئر کریں' },
  'Share with Poster': { en: 'Share with Poster', 'ur-roman': 'Poster ke Sath Share Karein', ur: 'پوسٹر کے ساتھ شیئر کریں' },
  'Tap text to copy': { en: 'Tap text to copy', 'ur-roman': 'Copy karne ke liye dabayein', ur: 'کاپی کرنے کے لیے ٹیپ کریں' },
  'Preparing...': { en: 'Preparing...', 'ur-roman': 'Tayyar ho raha hai...', ur: 'تیار ہو رہا ہے...' },
  'High Quality Poster': { en: 'High Quality Poster', 'ur-roman': 'High Quality Poster', ur: 'اعلیٰ معیار کا پوسٹر' },
  'Message Preview': { en: 'Message Preview', 'ur-roman': 'Message Preview', ur: 'پیغام کا پیش نظارہ' },
  'Content Poster': { en: 'Content Poster', 'ur-roman': 'Content Poster', ur: 'مواد کا پوسٹر' },
  'Poster image will be shared together with details.': { en: 'Poster image will be shared together with details.', 'ur-roman': 'Poster tasveer tafseelat ke sath share ki jayegi.', ur: 'پوسٹر کی تصویر تفصیلات کے ساتھ شیئر کی جائے گی۔' },
  'Poster downloaded & text copied to clipboard!': { en: 'Poster downloaded & text copied to clipboard!', 'ur-roman': 'Poster download ho gaya aur text copy ho gaya!', ur: 'پوسٹر ڈاؤن لوڈ اور ٹیکسٹ کاپی ہو گیا!' },
  'Text copied to clipboard!': { en: 'Text copied to clipboard!', 'ur-roman': 'Text clipboard par copy ho gaya!', ur: 'ٹیکسٹ کلپ بورڈ پر کاپی ہو گیا!' },
  'chars': { en: 'chars', 'ur-roman': 'chars', ur: 'حروف' },
  'Change Poster': { en: 'Change Poster', 'ur-roman': 'Poster Badlein', ur: 'پوسٹر تبدیل کریں' },
  'Poster Gallery': { en: 'Poster Gallery', 'ur-roman': 'Poster Gallery', ur: 'پوسٹر گیلری' },
  'Select Poster': { en: 'Select Poster', 'ur-roman': 'Poster Chunein', ur: 'پوسٹر منتخب کریں' },
  'Loading Gallery...': { en: 'Loading Gallery...', 'ur-roman': 'Gallery load ho rahi hai...', ur: 'گیلری لوڈ ہو رہی ہے...' },
  'No posters found in gallery.': { en: 'No posters found in gallery.', 'ur-roman': 'Gallery mein koi poster nahi mila.', ur: 'گیلری میں کوئی پوسٹر نہیں ملا۔' },
  'Poster Selected': { en: 'Poster selected!', 'ur-roman': 'Poster muntakhib ho gaya!', ur: 'پوسٹر منتخب ہو گیا!' },
  'View on TMDB': { en: 'View on TMDB', 'ur-roman': 'TMDB par Dekhein', ur: 'TMDB پر دیکھیں' },
  'AI Translated': { en: 'AI Translated', 'ur-roman': 'AI se Tarjuma Shuda', ur: 'AI سے ترجمہ شدہ' },
  'Show AI Translation': { en: 'Show AI Translation', 'ur-roman': 'AI Tarjuma Dekhein', ur: 'AI ترجمہ دیکھیں' },
  'Show Original': { en: 'Show Original', 'ur-roman': 'Asli Dekhein', ur: 'اصل دیکھیں' },
  'Translating synopsis to your selected language with AI...': { en: 'Translating synopsis to your selected language with AI...', 'ur-roman': 'AI ke zariye khulasa ka tarjuma kiya ja raha hai...', ur: 'AI کے ذریعے خلاصے کا ترجمہ کیا جا رہا ہے...' },
  'No overview available for this upcoming title.': { en: 'No overview available for this upcoming title.', 'ur-roman': 'Is title ka koi khulasa dastiyab nahi hai.', ur: 'اس آنے والے عنوان کے لیے کوئی خلاصہ دستیاب نہیں ہے۔' },
  'Official Trailer': { en: 'Official Trailer', 'ur-roman': 'Official Trailer', ur: 'آفیشل ٹریلر' },
  'Close Trailer': { en: 'Close Trailer', 'ur-roman': 'Trailer Band Karein', ur: 'ٹریلر بند کریں' },
  'Loading Official Trailer...': { en: 'Loading Official Trailer...', 'ur-roman': 'Official Trailer load ho raha hai...', ur: 'آفیشل ٹریلر لوڈ ہو رہا ہے...' },
  'Direct trailer embed not found on TMDB.': { en: 'Direct trailer embed not found on TMDB.', 'ur-roman': 'TMDB par direct trailer nahi mila.', ur: 'TMDB پر براہ راست ٹریلر نہیں ملا۔' },
  'Search & Watch on YouTube': { en: 'Search & Watch on YouTube', 'ur-roman': 'YouTube par Talash Karein aur Dekhein', ur: 'یوٹیوب پر تلاش کریں اور دیکھیں' },
  'Open Original Resolution': { en: 'Open Original Resolution', 'ur-roman': 'Asli Resolution Kholein', ur: 'اصل ریزولوشن کھولیں' },
  'Close Fullscreen': { en: 'Close Fullscreen', 'ur-roman': 'Fullscreen Band Karein', ur: 'فل اسکرین بند کریں' },
  'Loading Image...': { en: 'Loading Image...', 'ur-roman': 'Tasveer load ho rahi hai...', ur: 'تصویر لوڈ ہو رہی ہے...' },
  'Poster': { en: 'Poster', 'ur-roman': 'Poster', ur: 'پوسٹر' },
  'Backdrop': { en: 'Backdrop', 'ur-roman': 'Backdrop', ur: 'بیک ڈراپ' },

  // Cart, Favorites, Watch Later, Reviews, Settings & Rewards
  'Checkout Items': { en: 'Checkout Items', 'ur-roman': 'Checkout Items', ur: 'چیک آؤٹ آئٹمز' },
  'Complete Your Order': { en: 'Complete Your Order', 'ur-roman': 'Apna Order Mukammal Karein', ur: 'اپنا آرڈر مکمل کریں' },
  'Review your selected movies and series seasons before confirming your payment.': { en: 'Review your selected movies and series seasons before confirming your payment.', 'ur-roman': 'Payment ki tasdeeq se pehle apne muntakhib karda movies aur series check karein.', ur: 'ادائیگی کی تصدیق کرنے سے پہلے اپنی منتخب کردہ موویز اور سیریز سیزن کا جائزہ لیں۔' },
  'Item': { en: 'Item', 'ur-roman': 'Item', ur: 'آئٹم' },
  'Remove Item': { en: 'Remove Item', 'ur-roman': 'Item Hatayein', ur: 'آئٹم ہٹائیں' },
  'Your cart is empty': { en: 'Your cart is empty', 'ur-roman': 'Aap ka cart khali hai', ur: 'آپ کا کارٹ خالی ہے' },
  'Add Movies and Series (Seasons) from home page and start watching.': { en: 'Add Movies and Series (Seasons) from home page and start watching.', 'ur-roman': 'Home page se movies aur series add karein aur dekhna shuru karein.', ur: 'ہوم پیج سے موویز اور سیریز شامل کریں اور دیکھنا شروع کریں۔' },
  'Browse Content': { en: 'Browse Content', 'ur-roman': 'Content Dekhein', ur: 'مواد دیکھیں' },
  'Order Confirmed': { en: 'Order Confirmed', 'ur-roman': 'Order Confirmed Ho Gaya', ur: 'آرڈر کی تصدیق ہو گئی' },
  'Favorite Collection': { en: 'Favorite Collection', 'ur-roman': 'Pasandida Collection', ur: 'پسندیدہ مجموعہ' },
  'Your Favorite Content': { en: 'Your Favorite Content', 'ur-roman': 'Aap ka Pasandida Content', ur: 'آپ کا پسندیدہ مواد' },
  'All your top-rated and loved movies and series in one place. Stream your favorites anytime.': { en: 'All your top-rated and loved movies and series in one place. Stream your favorites anytime.', 'ur-roman': 'Aapki tamam pasandida movies aur series ek jagah. Kisi bhi waqt enjoy karein.', ur: 'آپ کی تمام پسندیدہ موویز اور سیریز ایک ہی جگہ۔ کسی بھی وقت لطف اٹھائیں۔' },
  'Title Favorited': { en: 'Title Favorited', 'ur-roman': 'Title Pasandida Mein Shamil', ur: 'عنوان پسندیدہ میں شامل' },
  'Titles Favorited': { en: 'Titles Favorited', 'ur-roman': 'Titles Pasandida Mein Shamil', ur: 'عنوانات پسندیدہ میں شامل' },
  'Click the heart icon on any movie or series you love to save it to your personal favorite collection.': { en: 'Click the heart icon on any movie or series you love to save it to your personal favorite collection.', 'ur-roman': 'Apni pasandida collection mein shamil karne ke liye kisi bhi movie ya series par dil ka icon dabayein.', ur: 'اپنی ذاتی پسندیدہ فہرست میں محفوظ کرنے کے لیے کسی بھی مووی یا سیریز پر دل کے آئیکن پر کلک کریں۔' },
  'Discover Movies': { en: 'Discover Movies', 'ur-roman': 'Nayi Movies Talash Karein', ur: 'موویز دریافت کریں' },
  'Go back to Home': { en: 'Go back to Home', 'ur-roman': 'Home par wapis jayein', ur: 'ہوم پر واپس جائیں' },
  'Back': { en: 'Back', 'ur-roman': 'Wapis', ur: 'واپس' },
  'View Full Poster & Gallery': { en: 'View Full Poster & Gallery', 'ur-roman': 'Mukammal Poster aur Gallery Dekhein', ur: 'مکمل پوسٹر اور گیلری دیکھیں' },
  'View Poster & Gallery': { en: 'View Poster & Gallery', 'ur-roman': 'Poster aur Gallery Dekhein', ur: 'پوسٹر اور گیلری دیکھیں' },
  'Open Poster to View More': { en: 'Open Poster to View More', 'ur-roman': 'Mazeed Dekhne Ke Liye Poster Kholein', ur: 'مزید دیکھنے کے لیے پوسٹر کھولیں' },
  'Tap to expand HD gallery': { en: 'Tap to expand HD gallery', 'ur-roman': 'HD gallery kholne ke liye tap karein', ur: 'ایچ ڈی گیلری کھولنے کے لیے ٹیپ کریں' },
  'Saved Queue': { en: 'Saved Queue', 'ur-roman': 'Mehfooz List', ur: 'محفوظ شدہ فہرست' },
  'Your Watch Later List': { en: 'Your Watch Later List', 'ur-roman': 'Aap ki Baad Mein Dekhne Wali List', ur: 'آپ کی بعد میں دیکھنے کی فہرست' },
  'Keep track of movies and series you plan to stream next. Easily access them anytime.': { en: 'Keep track of movies and series you plan to stream next. Easily access them anytime.', 'ur-roman': 'Jo movies aur series aap agay dekhna chahte hain unhein mehfooz rakhein.', ur: 'ان موویز اور سیریز کا ٹریک رکھیں جنہیں آپ آگے دیکھنا چاہتے ہیں۔' },
  'Title Saved': { en: 'Title Saved', 'ur-roman': 'Title Mehfooz Ho Gaya', ur: 'عنوان محفوظ ہو گیا' },
  'Titles Saved': { en: 'Titles Saved', 'ur-roman': 'Titles Mehfooz Ho Gaye', ur: 'عنوانات محفوظ ہو گئے' },
  'Explore our collection and click the watch later bookmark icon on any title to save it here for quick access.': { en: 'Explore our collection and click the watch later bookmark icon on any title to save it here for quick access.', 'ur-roman': 'Fori access ke liye kisi bhi title par bookmark icon daba kar yahan mehfooz karein.', ur: 'فوری رسائی کے لیے کسی بھی عنوان پر بک مارک آئیکن پر کلک کر کے اسے یہاں محفوظ کریں۔' },
  'Explore Content': { en: 'Explore Content', 'ur-roman': 'Content Dekhein', ur: 'مواد دریافت کریں' },
  'Account Settings': { en: 'Account Settings', 'ur-roman': 'Account Settings', ur: 'اکاؤنٹ سیٹنگز' },
  'User Profile': { en: 'User Profile', 'ur-roman': 'User Profile', ur: 'صارف پروفائل' },
  'Account Details': { en: 'Account Details', 'ur-roman': 'Account ki Tafseelat', ur: 'اکاؤنٹ کی تفصیلات' },
  'Notification Preferences': { en: 'Notification Preferences', 'ur-roman': 'Notification ki Preferences', ur: 'اطلاعات کی ترجیحات' },
  'Movie & Series Email Alerts': { en: 'Movie & Series Email Alerts', 'ur-roman': 'Movie aur Series Email Alerts', ur: 'مووی اور سیریز ای میل الرٹس' },
  'Receive email updates when new movies and TV series are released on MovizNow.': { en: 'Receive email updates when new movies and TV series are released on MovizNow.', 'ur-roman': 'MovizNow par nayi movies aur series aane par email updates haasil karein.', ur: 'جب MovizNow پر نئی موویز اور ٹی وی سیریز جاری ہوں تو ای میل اپ ڈیٹس حاصل کریں۔' },
  'Instant Membership Access': { en: 'Instant Membership Access', 'ur-roman': 'Fori Membership Access', ur: 'فوری ممبرشپ رسائی' },
  'Your Subscription': { en: 'Your Subscription', 'ur-roman': 'Aap ki Subscription', ur: 'آپ کی سبسکرپشن' },
  'Select your plan duration, send payment, and submit for instant verification.': { en: 'Select your plan duration, send payment, and submit for instant verification.', 'ur-roman': 'Plan duration muntakhib karein, payment bhejein aur fori tasdeeq karwayein.', ur: 'اپنے پلان کی مدت منتخب کریں، ادائیگی بھیجیں، اور فوری تصدیق کے لیے جمع کروائیں۔' },
  'Pending Order Active': { en: 'Pending Order Active', 'ur-roman': 'Pending Order Active Hai', ur: 'زیر التواء آرڈر فعال ہے' },
  'You already have a Pending Membership Order. Send payment screenshot or cancel it to place a new order.': { en: 'You already have a Pending Membership Order. Send payment screenshot or cancel it to place a new order.', 'ur-roman': 'Aap ka ek membership order pehle se pending hai. Payment screenshot bhejein ya naye order ke liye cancel karein.', ur: 'آپ کا ایک ممبرشپ آرڈر پہلے ہی زیر التواء ہے۔ ادائیگی کا اسکرین شاٹ بھیجیں یا نیا آرڈر دینے کے لیے اسے منسوخ کریں۔' },
  'Membership Plans': { en: 'Membership Plans', 'ur-roman': 'Membership Plans', ur: 'ممبرشپ پلانز' },
  'My Reviews': { en: 'My Reviews', 'ur-roman': 'Mere Reviews', ur: 'میرے جائزے' },
  'You have not submitted a review yet. Please write a review first to get +5 Days free VIP access!': { en: 'You have not submitted a review yet. Please write a review first to get +5 Days free VIP access!', 'ur-roman': 'Aap ne abhi tak koi review nahi diya. 5 din ka free access paane ke liye review dein!', ur: 'آپ نے ابھی تک کوئی جائزہ جمع نہیں کرایا ہے۔ مفت 5 دن کی VIP رسائی حاصل کرنے کے لیے پہلے جائزہ لکھیں!' },
  'Per Friend': { en: 'Per Friend', 'ur-roman': 'Har Dost Par', ur: 'فی دوست' },
  'Copy Code': { en: 'Copy Code', 'ur-roman': 'Code Copy Karein', ur: 'کوڈ کاپی کریں' },
  'Claimed (+5 Days)': { en: 'Claimed (+5 Days)', 'ur-roman': 'Claim Kar Liya (+5 Din)', ur: 'حاصل کر لیا (+5 دن)' },
  'Claim Reward (+5 Days)': { en: 'Claim Reward (+5 Days)', 'ur-roman': 'Inam Claim Karein (+5 Din)', ur: 'انعام حاصل کریں (+5 دن)' },
  'Claim Signup (+5 Days)': { en: 'Claim Signup (+5 Days)', 'ur-roman': 'Signup Claim Karein (+5 Din)', ur: 'سائن اپ انعام حاصل کریں (+5 دن)' },
  'Signup Claimed (+5)': { en: 'Signup Claimed (+5)', 'ur-roman': 'Signup Claim Ho Gaya (+5)', ur: 'سائن اپ حاصل کر لیا (+5)' },
  'Claim Activation (+5 Days)': { en: 'Claim Activation (+5 Days)', 'ur-roman': 'Activation Claim Karein (+5 Din)', ur: 'ایکٹیویشن انعام حاصل کریں (+5 دن)' },
  'Activation Claimed (+5)': { en: 'Activation Claimed (+5)', 'ur-roman': 'Activation Claim Ho Gaya (+5)', ur: 'ایکٹیویشن حاصل کر لیا (+5)' },
  'Pending activation for +5 days': { en: 'Pending activation for +5 days', 'ur-roman': '+5 din ke liye activation pending hai', ur: '+5 دن کے لیے ایکٹیویشن زیر التواء ہے' },
  'Guest User': { en: 'Guest User', 'ur-roman': 'Guest User', ur: 'مہمان صارف' },
  'Top-Up': { en: 'Top-Up', 'ur-roman': 'Top-Up', ur: 'ٹاپ اپ' },
  'Navigation': { en: 'Navigation', 'ur-roman': 'Navigation', ur: 'نیویگیشن' },
  'Saved': { en: 'Saved', 'ur-roman': 'Mehfooz', ur: 'محفوظ شدہ' },
  'Preferences': { en: 'Preferences', 'ur-roman': 'Preferences', ur: 'ترجیحات' },
  'App & Account': { en: 'App & Account', 'ur-roman': 'App aur Account', ur: 'ایپ اور اکاؤنٹ' },
  'You have submitted the maximum allowed 2 reviews per account. Thank you for your feedback!': { en: 'You have submitted the maximum allowed 2 reviews per account. Thank you for your feedback!', 'ur-roman': 'Aap ne har account par zyada se zyada 2 reviews bhej diye hain. Shukriya!', ur: 'آپ فی اکاؤنٹ زیادہ سے زیادہ 2 جائزے جمع کرا چکے ہیں۔ آپ کی رائے کا شکریہ!' },
  'Failed to submit review': { en: 'Failed to submit review', 'ur-roman': 'Review bhejne mein nakami hui', ur: 'جائزہ جمع کرانے میں ناکامی' },
  'Failed to delete review': { en: 'Failed to delete review', 'ur-roman': 'Review delete karne mein nakami hui', ur: 'جائزہ حذف کرنے میں ناکامی' },
  'Push notifications are not supported in this browser/device. Please allow notifications in a supported browser to claim.': { en: 'Push notifications are not supported in this browser/device. Please allow notifications in a supported browser to claim.', 'ur-roman': 'Is browser mein push notifications support nahi hain.', ur: 'اس براؤزر/ڈیوائس میں پش اطلاعات معاون نہیں ہیں۔' },
  'Please allow notifications permission in your browser to claim this reward.': { en: 'Please allow notifications permission in your browser to claim this reward.', 'ur-roman': 'Is inam ke liye browser mein notification ki ijazat dein.', ur: 'اس انعام کو حاصل کرنے کے لیے براہ کرم اپنے براؤزر میں اطلاعات کی اجازت دیں۔' },
  'Verifying...': { en: 'Verifying...', 'ur-roman': 'Tasdeeq ho rahi hai...', ur: 'تصدیق ہو رہی ہے...' },
  'Enabling...': { en: 'Enabling...', 'ur-roman': 'On ho raha hai...', ur: 'فعال کیا جا رہا ہے...' },
  'Paid Member': { en: 'Paid Member', 'ur-roman': 'Paid Member', ur: 'پیڈ ممبر' },
  'Login': { en: 'Login', 'ur-roman': 'Login', ur: 'لاگ ان' },
  'Code': { en: 'Code', 'ur-roman': 'Code', ur: 'کوڈ' },
  'Sample': { en: 'Sample', 'ur-roman': 'Sample', ur: 'نمونہ' },
  'Access Restricted': { en: 'Access Restricted', 'ur-roman': 'Access Restricted', ur: 'رسائی محدود ہے' },
  'Error loading seasons': { en: 'Error loading seasons', 'ur-roman': 'Seasons load karne mein masla hua', ur: 'سیزن لوڈ کرنے میں خرابی' },
  'Fetching images...': { en: 'Fetching images...', 'ur-roman': 'Tasaveer aa rahi hain...', ur: 'تصاویر لائی جا رہی ہیں...' },
  'Loading image...': { en: 'Loading image...', 'ur-roman': 'Tasveer load ho rahi hai...', ur: 'تصویر لوڈ ہو رہی ہے...' },
  'To install this app, please use the "Add to Home Screen" option in your browser menu.': { en: 'To install this app, please use the "Add to Home Screen" option in your browser menu.', 'ur-roman': 'Is app ko install karne ke liye browser menu mein "Add to Home Screen" use karein.', ur: 'اس ایپ کو انسٹال کرنے کے لیے براہ کرم اپنے براؤزر مینو میں "Add to Home Screen" کا آپشن استعمال کریں۔' },
  'A password reset link has been sent to your email.': { en: 'A password reset link has been sent to your email.', 'ur-roman': 'Password reset link aapke email par bhej diya gaya hai.', ur: 'پاس ورڈ ری سیٹ کا لنک آپ کے ای میل پر بھیج دیا گیا ہے۔' },
  
  'Notification Center': { en: 'Notification Center', 'ur-roman': 'Ittelaat Markaz', ur: 'اطلاعات سنٹر' },
  'Push Notifications (FCM)': { en: 'Push Notifications (FCM)', 'ur-roman': 'Push Notifications (FCM)', ur: 'پش نوٹیفیکیشنز (FCM)' },
  'Email Notifications': { en: 'Email Notifications', 'ur-roman': 'Email Notifications', ur: 'ای میل اطلاعات' },
  'Manage how you receive alerts, releases, and security updates.': { en: 'Manage how you receive alerts, releases, and security updates.', 'ur-roman': 'Alerts, nayi releases aur security updates hasil karne ki settings.', ur: 'الرٹس، نئی ریلیزز اور سیکیورٹی اپ ڈیٹس حاصل کرنے کی سیٹنگز کا انتظام کریں۔' },
  'Push Alerts': { en: 'Push Alerts', 'ur-roman': 'Push Alerts', ur: 'پش الرٹس' },
  'Email Alerts': { en: 'Email Alerts', 'ur-roman': 'Email Alerts', ur: 'ای میل الرٹس' },
  'Login & Security Alerts': { en: 'Login & Security Alerts', 'ur-roman': 'Login aur Security Alerts', ur: 'لاگ ان اور سیکیورٹی الرٹس' },
  'Receive instant alerts when a new sign-in or active session occurs on your account.': { en: 'Receive instant alerts when a new sign-in or active session occurs on your account.', 'ur-roman': 'Jab aap ke account par naya login ya session ho to fori alert hasil karein.', ur: 'اپنے اکاؤنٹ پر نیا سائن ان یا سیشن ہونے پر فوری الرٹ حاصل کریں۔' },
  'New Content Notify': { en: 'New Content Notify', 'ur-roman': 'Naye Content Ki Ittela', ur: 'نئے مواد کی اطلاع' },
  'Get notified immediately when new HD movies, seasons, or requested titles are added.': { en: 'Get notified immediately when new HD movies, seasons, or requested titles are added.', 'ur-roman': 'Nayi HD movies, seasons ya requested titles shamil hone par fori ittela hasil karein.', ur: 'نئی ایچ ڈی موویز، سیزنز یا فرمائشی ٹائٹلز شامل ہونے پر فوری اطلاع حاصل کریں۔' },
  'Membership Expiry Alerts': { en: 'Membership Expiry Alerts', 'ur-roman': 'Membership Expiry Alerts', ur: 'ممبرشپ کی میعاد ختم ہونے کے الرٹس' },
  'Membership Alerts': { en: 'Membership Alerts', 'ur-roman': 'Membership Alerts', ur: 'ممبرشپ الرٹس' },
  'Receive reminders before your plan expires and on the expiry day to avoid interruption.': { en: 'Receive reminders before your plan expires and on the expiry day to avoid interruption.', 'ur-roman': 'Plan khatam hone se pehle aur expiry ke din yaad-dehani hasil karein.', ur: 'پلان ختم ہونے سے پہلے اور میعاد ختم ہونے کے دن یاد دہانی حاصل کریں۔' },
  'Receive instant push alerts when your membership plan, expiry date, or active subscription is updated or expiring.': { en: 'Receive instant push alerts when your membership plan, expiry date, or active subscription is updated or expiring.', 'ur-roman': 'Membership plan ya expiry date update ya expire hone par fori push alerts hasil karein.', ur: 'جب آپ کا ممبرشپ پلان یا میعاد کی تاریخ اپ ڈیٹ یا ختم ہو رہی ہو تو فوری پش الرٹس حاصل کریں۔' },
  'Receive detailed security emails with timestamp and device info upon account login.': { en: 'Receive detailed security emails with timestamp and device info upon account login.', 'ur-roman': 'Login par device aur waqt ki tafseelat ke sath security email hasil karein.', ur: 'لاگ ان پر ڈیوائس اور وقت کی تفصیلات کے ساتھ سیکیورٹی ای میل حاصل کریں۔' },
  'Receive weekly newsletters and release emails for trending movies and exclusive series.': { en: 'Receive weekly newsletters and release emails for trending movies and exclusive series.', 'ur-roman': 'Trending movies aur series ke baray mein email updates aur alerts hasil karein.', ur: 'ٹرینڈنگ موویز اور سیریز کے بارے میں ای میل اپ ڈیٹس اور الرٹس حاصل کریں۔' },
  'Receive official renewal notices and invoice summaries for your membership.': { en: 'Receive official renewal notices and invoice summaries for your membership.', 'ur-roman': 'Membership renewal notices aur receipts email par hasil karein.', ur: 'ممبرشپ کی تجدید کے نوٹس اور رسیدیں ای میل پر حاصل کریں۔' },
  'Receive official email notices when your membership plan or expiry date is updated, extended, or expiring.': { en: 'Receive official email notices when your membership plan or expiry date is updated, extended, or expiring.', 'ur-roman': 'Jab membership plan ya expiry date update, extend ya expire ho to official email notices hasil karein.', ur: 'جب آپ کا ممبرشپ پلان یا میعاد کی تاریخ اپ ڈیٹ، توسیع یا ختم ہو تو سرکاری ای میل نوٹس حاصل کریں۔' },
  'Notification Services': { en: 'Notification Services', 'ur-roman': 'Notification Services', ur: 'اطلاعات کی خدمات' },
  'Membership Management': { en: 'Membership Management', 'ur-roman': 'Membership Management', ur: 'ممبرشپ مینجمنٹ' },
  'Active Services': { en: 'Active Services', 'ur-roman': 'Active Services', ur: 'فعال خدمات' },
  'Notification Services Configured': { en: 'Notification Services Configured', 'ur-roman': 'Notification Services Set Ho Gayi', ur: 'اطلاعات کی خدمات تشکیل دی گئیں' },
  'Device Push Permission': { en: 'Device Push Permission', 'ur-roman': 'Device Push Ijazat', ur: 'ڈیوائس پش اجازت' },
  'Permission Granted': { en: 'Permission Granted', 'ur-roman': 'Ijazat Mil Gayi', ur: 'اجازت مل گئی' },
  'Permission Required': { en: 'Permission Required', 'ur-roman': 'Ijazat Darkar Hai', ur: 'اجازت درکار ہے' },
  'Blocked in Browser': { en: 'Blocked in Browser', 'ur-roman': 'Browser Mein Blocked', ur: 'براؤزر میں مسدود' },
  'Enable Push': { en: 'Enable Push', 'ur-roman': 'Push On Karein', ur: 'پش آن کریں' },
  'Master Push Switch': { en: 'Master Push Switch', 'ur-roman': 'Master Push Switch', ur: 'مرکزی پش سوئچ' },
  'Master Email Switch': { en: 'Master Email Switch', 'ur-roman': 'Master Email Switch', ur: 'مرکزی ای میل سوئچ' },
  'All Push Alerts Enabled': { en: 'All Push Alerts Enabled', 'ur-roman': 'Tamam Push Alerts On Hain', ur: 'تمام پش الرٹس فعال ہیں' },
  'All Push Alerts Muted': { en: 'All Push Alerts Muted', 'ur-roman': 'Push Alerts Band Hain', ur: 'پش الرٹس بند ہیں' },
  'All Email Alerts Enabled': { en: 'All Email Alerts Enabled', 'ur-roman': 'Tamam Email Alerts On Hain', ur: 'تمام ای میل الرٹس فعال ہیں' },
  'All Email Alerts Muted': { en: 'All Email Alerts Muted', 'ur-roman': 'Email Alerts Band Hain', ur: 'ای میل الرٹس بند ہیں' },
  'Active': { en: 'Active', 'ur-roman': 'Active', ur: 'فعال' },
  'Disabled': { en: 'Disabled', 'ur-roman': 'Disabled', ur: 'غیر فعال' },
  'Instant': { en: 'Instant', 'ur-roman': 'Fori', ur: 'فوری' },
  'Updates': { en: 'Updates', 'ur-roman': 'Updates', ur: 'اپ ڈیٹس' },
  'Critical': { en: 'Critical', 'ur-roman': 'Zaroori', ur: 'اہم' },
  'Security': { en: 'Security', 'ur-roman': 'Security', ur: 'سیکیورٹی' },
  'Billing': { en: 'Billing', 'ur-roman': 'Billing', ur: 'بلنگ' },
  'Releases': { en: 'Releases', 'ur-roman': 'Releases', ur: 'ریلیزز' },
  'Newsletter': { en: 'Newsletter', 'ur-roman': 'Khabarnama', ur: 'خبر نامہ' },
  'Device Push': { en: 'Device Push', 'ur-roman': 'Device Push', ur: 'ڈیوائس پش' },
  'Instant Push': { en: 'Instant Push', 'ur-roman': 'Fori Push', ur: 'فوری پش' },
  'Email Delivery': { en: 'Email Delivery', 'ur-roman': 'Email Delivery', ur: 'ای میل ترسیل' },
  'Allow Notifications': { en: 'Allow Notifications', 'ur-roman': 'Notifications Ijazat Dein', ur: 'اطلاعات کی اجازت دیں' },
  'Permission Blocked': { en: 'Permission Blocked', 'ur-roman': 'Ijazat Blocked Hai', ur: 'اجازت مسدود ہے' },
  'Permission Active': { en: 'Permission Active', 'ur-roman': 'Ijazat Faal Hai', ur: 'اجازت فعال ہے' },
  'Enable in Browser': { en: 'Enable in Browser', 'ur-roman': 'Browser Mein On Karein', ur: 'براؤزر میں آن کریں' },
  'Notifications are blocked in your browser settings.': { en: 'Notifications are blocked in your browser settings.', 'ur-roman': 'Aap ke browser ki settings mein notifications blocked hain.', ur: 'آپ کے براؤزر کی سیٹنگز میں اطلاعات مسدود ہیں۔' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  translate: (text: string) => Promise<string>;
  translateMany: (texts: string[]) => Promise<string[]>;
  t: (key: string) => string;
  isTranslating: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = safeStorage.getItem('app_language');
    return (saved as Language) || 'en';
  });
  const isTranslatingRef = useRef(false);
  const failureCount = useRef(0);
  const MAX_FAILURES = 3;
  
  const pendingTranslations = useRef<Map<string, { resolve: (val: string) => void, reject: (err: any) => void }>>(new Map());
  const inFlightTranslations = useRef<Map<string, Promise<string>>>(new Map());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    safeStorage.setItem('app_language', lang);
    window.dispatchEvent(new CustomEvent('app_language_changed', { detail: lang }));
  };

  const t = (key: string): string => {
    if (language === 'en') return key;
    return translations[key]?.[language] || key;
  };

  const executeBatchTranslation = async () => {
    if (pendingTranslations.current.size === 0) return;
    
    if (failureCount.current >= MAX_FAILURES) {
      console.warn("Translation disabled due to multiple failures");
      const itemsToTranslate = Array.from(pendingTranslations.current.entries());
      pendingTranslations.current.clear();
      itemsToTranslate.forEach(([text, { resolve }]) => resolve(text));
      return;
    }

    const itemsToTranslate = Array.from(pendingTranslations.current.entries());
    pendingTranslations.current.clear();
    
    isTranslatingRef.current = true;
    
    const targetLangName = language === 'ur-roman' ? 'Roman Urdu (written with English alphabet)' : 'Urdu';
    
    try {
      const texts = itemsToTranslate.map(([text]) => text);
      
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texts, targetLanguage: targetLangName })
      });
      const data = await res.json();
      
      if (data.translation && Array.isArray(data.translation)) {
        const translatedArray = data.translation;
        const CACHE_EXPIRATION = 30 * 60 * 1000;
        
        itemsToTranslate.forEach(([text, { resolve }], index) => {
          const translated = translatedArray[index] || text;
          const cacheKey = `v2_trans_${language}_${btoa(encodeURIComponent(text.substring(0, 150)))}`;
          const cacheData = JSON.stringify({
            translated,
            timestamp: Date.now()
          });
          safeStorage.setItemAsync(cacheKey, cacheData);
          resolve(translated);
        });
        failureCount.current = 0; // Reset on success
      } else {
        failureCount.current++;
        itemsToTranslate.forEach(([text, { resolve }]) => resolve(text));
      }
    } catch (e) {
      console.error("Batch translation failed", e);
      failureCount.current++;
      itemsToTranslate.forEach(([text, { resolve }]) => resolve(text));
    } finally {
      isTranslatingRef.current = false;
    }
  };

  const translate = async (text: string): Promise<string> => {
    if (language === 'en' || !text) return text;
    
    // Skip translating generic episode titles
    if (/^episode\s+\d+$/i.test(text.trim())) return text;
    
    const CACHE_EXPIRATION = 30 * 60 * 1000;
    const cacheKey = `v2_trans_${language}_${btoa(encodeURIComponent(text.substring(0, 150)))}`;
    
    try {
      const cached = await safeStorage.getItemAsync(cacheKey);
      if (cached) {
        const { translated, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_EXPIRATION) {
          return translated;
        }
      }
    } catch (e) {
      // Ignore cache errors
    }

    // Check if already in-flight
    if (inFlightTranslations.current.has(text)) {
      return inFlightTranslations.current.get(text)!;
    }

    const promise = new Promise<string>((resolve, reject) => {
      pendingTranslations.current.set(text, { resolve, reject });
      
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(executeBatchTranslation, 1500); 
    });

    inFlightTranslations.current.set(text, promise);
    promise.finally(() => {
      inFlightTranslations.current.delete(text);
    });

    return promise;
  };

  const translateMany = async (texts: string[]): Promise<string[]> => {
    if (language === 'en' || !texts || texts.length === 0) return texts;
    
    const promises = texts.map(text => translate(text));
    
    // If we have new pending translations, trigger them immediately
    if (pendingTranslations.current.size > 0) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      executeBatchTranslation();
    }
    
    return Promise.all(promises);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, translate, translateMany, t, isTranslating: isTranslatingRef.current }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
