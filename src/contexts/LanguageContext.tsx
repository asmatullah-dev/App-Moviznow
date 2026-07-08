import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';
import { safeStorage } from '../utils/safeStorage';

export type Language = 'en' | 'ur-roman' | 'ur';

const translations: Record<string, Record<Language, string>> = {
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
  'Theme': { en: 'Theme', 'ur-roman': 'Theme', ur: 'تھیم' },
  'Language': { en: 'Language', 'ur-roman': 'Zuban', ur: 'زبان' },
  'Haptics': { en: 'Haptics', 'ur-roman': 'Haptics', ur: 'ہیپٹکس' },
  'Membership': { en: 'Membership', 'ur-roman': 'Membership', ur: 'ممبرشپ' },
  'Synopsis': { en: 'Synopsis', 'ur-roman': 'Khulasa', ur: 'خلاصہ' },
  'Recommended': { en: 'Recommended', 'ur-roman': 'Sifarish karda', ur: 'سفارش کردہ' },
  'Recently Viewed': { en: 'Recently Viewed', 'ur-roman': 'Haal hi mein dekha gaya', ur: 'حال ہی میں دیکھا گیا' },
  'Cast': { en: 'Cast', 'ur-roman': 'Cast', ur: 'کاسٹ' },
  'Genre:': { en: 'Genre:', 'ur-roman': 'Asnaf:', ur: 'صنف:' },
  'Language:': { en: 'Language:', 'ur-roman': 'Zuban:', ur: 'زبان:' },
  'Quality:': { en: 'Quality:', 'ur-roman': 'Miyar:', ur: 'معیار:' },
  'Download & Play': { en: 'Download & Play', 'ur-roman': 'Download aur play karein', ur: 'ڈاؤن لوڈ اور پلے' },
  'Movie Links': { en: 'Movie Links', 'ur-roman': 'Movie links', ur: 'مووی لنکس' },
  'Genre': { en: 'Genre', 'ur-roman': 'Genre', ur: 'صنف' },
  'Quality': { en: 'Quality', 'ur-roman': 'Miyar', ur: 'معیار' },
  'Year': { en: 'Year', 'ur-roman': 'Saal', ur: 'سال' },
  'Type': { en: 'Type', 'ur-roman': 'Qisam', ur: 'قسم' },
  'Movies': { en: 'Movies', 'ur-roman': 'Movies', ur: 'موویز' },
  'Series': { en: 'Series', 'ur-roman': 'Series', ur: 'سیریز' },
  'Types': { en: 'Types', 'ur-roman': 'Iqsam', ur: 'اقسام' },
  'Genres': { en: 'Genres', 'ur-roman': 'Asnaf', ur: 'اصناف' },
  'Langs': { en: 'Langs', 'ur-roman': 'Zubanain', ur: 'زبانیں' },
  'Years': { en: 'Years', 'ur-roman': 'Saal', ur: 'سال' },
  'Quals': { en: 'Quals', 'ur-roman': 'Miyar', ur: 'معیار' },
  'Search movies & series...': { en: 'Search movies & series...', 'ur-roman': 'Movies aur series talash karein...', ur: 'موویز اور سیریز تلاش کریں...' },
  'Play': { en: 'Play', 'ur-roman': 'Chalaein', ur: 'چلائیں' },
  'Download': { en: 'Download', 'ur-roman': 'Download', ur: 'ڈاؤن لوڈ' },
  'Share': { en: 'Share', 'ur-roman': 'Share', ur: 'شیئر' },
  'Copy Link': { en: 'Copy Link', 'ur-roman': 'Link copy karein', ur: 'لنک کاپی کریں' },
  'WhatsApp Number': { en: 'WhatsApp Number', 'ur-roman': 'WhatsApp number', ur: 'واٹس ایپ نمبر' },
  'Add WhatsApp': { en: 'Add WhatsApp', 'ur-roman': 'WhatsApp add karein', ur: 'واٹس ایپ شامل کریں' },
  'Edit WhatsApp': { en: 'Edit WhatsApp', 'ur-roman': 'WhatsApp edit karein', ur: 'واٹس ایپ تبدیل کریں' },
  'Search global library...': { en: 'Search global library...', 'ur-roman': 'Global library talash karein...', ur: 'گلوبل لائبریری تلاش کریں...' },
  'Content not found or unavailable': { en: 'Content not found or unavailable', 'ur-roman': 'Content nahi mila ya dastiyab nahi hai', ur: 'مواد نہیں ملا یا دستیاب نہیں ہے' },
  'This content may have been removed or you don\'t have access to it.': { en: 'This content may have been removed or you don\'t have access to it.', 'ur-roman': 'Shayad ye content khatam kar diya gaya hai ya aapke paas iska access nahi hai.', ur: 'ہوسکتا ہے کہ یہ مواد ہٹا دیا گیا ہو یا آپ کو اس تک رسائی حاصل نہ ہو۔' },
  'Trailer': { en: 'Trailer', 'ur-roman': 'Trailer', ur: 'ٹریلر' },
  'Select Trailer': { en: 'Select Trailer', 'ur-roman': 'Trailer muntakhib karein', ur: 'ٹریلر منتخب کریں' },
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
  'Season': { en: 'Season', 'ur-roman': 'Season', ur: 'سیزن' },
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
  'Cancel': { en: 'Cancel', 'ur-roman': 'Cancel', ur: 'کینسل' },
  'OK': { en: 'OK', 'ur-roman': 'Theek hai', ur: 'ٹھیک ہے' },
  'Your Watch Later list is empty': { en: 'Your Watch Later list is empty', 'ur-roman': 'Aap ki Watch Later list khali hai', ur: 'آپ کی واچ لیٹر لسٹ خالی ہے' },
  'Your Favorites list is empty': { en: 'Your Favorites list is empty', 'ur-roman': 'Aap ki pasandida list khali hai', ur: 'آپ کی پسندیدہ لسٹ خالی ہے' },
  'Account Pending': { en: 'Account Pending', 'ur-roman': 'Account Pending', ur: 'اکاؤنٹ پینڈنگ' },
  'Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.': { en: 'Your account activation is pending. Please Get Membership or Add any content to cart to activate your account.', 'ur-roman': 'Aap ka account activation pending hai. Please Membership lein ya content cart mein add karein.', ur: 'آپ کے اکاؤنٹ کی فعالیت زیر التواء ہے۔ براہ کرم ممبرشپ حاصل کریں یا اپنے اکاؤنٹ کو فعال کرنے کے لیے کارٹ میں کوئی بھی مواد شامل کریں۔' },
  'Get Membership': { en: 'Get Membership', 'ur-roman': 'Membership lein', ur: 'ممبرشپ حاصل کریں' },
  'Scroll down to add specific seasons to your cart.': { en: 'Scroll down to add specific seasons to your cart.', 'ur-roman': 'Seasons cart mein add karne ke liye neechay scroll karein.', ur: 'مخصوص سیزن اپنے کارٹ میں شامل کرنے کے لیے نیچے اسکرول کریں۔' },
  'Need help or want to renew membership?': { en: 'Need help or want to renew membership?', 'ur-roman': 'Kya aap ko madad chahiye ya membership renew karni hai?', ur: 'مدد کی ضرورت ہے یا ممبرشپ کی تجدید کرنا چاہتے ہیں؟' },
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


  'Play Content': { en: 'Play Content', 'ur-roman': 'Content Play Karein', ur: 'مواد پلے کریں' },
  'How would you like to open': { en: 'How would you like to open', 'ur-roman': 'Aap kaise open karna chahenge', ur: 'آپ کیسے کھولنا چاہیں گے' },
  'Select Server': { en: 'Select Server', 'ur-roman': 'Server Select Karein', ur: 'سرور منتخب کریں' },
  'Recommended For You': { en: 'Recommended For You', 'ur-roman': 'Aap ke liye tajweez karda', ur: 'آپ کے لیے تجویز کردہ' },

  'N/A': { en: 'N/A', 'ur-roman': 'N/A', ur: 'N/A' },


  'Admin': { en: 'Admin', 'ur-roman': 'Admin', ur: 'ایڈمن' },


  'Refresh App Data': { en: 'Refresh App Data', 'ur-roman': 'App Data Refresh Karein', ur: 'ایپ ڈیٹا ریفریش کریں' },
  'Refreshing...': { en: 'Refreshing...', 'ur-roman': 'Refresh ho raha hai...', ur: 'ریفریش ہو رہا ہے...' },
  'Download via Telegram': { en: 'Download via Telegram', 'ur-roman': 'Telegram ke zariye Download karein', ur: 'ٹیلیگرام کے ذریعے ڈاؤن لوڈ کریں' },
  'Are you sure you want to download this file via Telegram?': { en: 'Are you sure you want to download this file via Telegram?', 'ur-roman': 'Kya aap waqai is file ko Telegram ke zariye download karna chahte hain?', ur: 'کیا آپ واقعی اس فائل کو ٹیلیگرام کے ذریعے ڈاؤن لوڈ کرنا چاہتے ہیں؟' },
  'Open in Telegram': { en: 'Open in Telegram', 'ur-roman': 'Telegram mein Kholein', ur: 'ٹیلیگرام میں کھولیں' },
  'Resolving...': { en: 'Resolving...', 'ur-roman': 'Resolve ho raha hai...', ur: 'حل ہو رہا ہے...' },
  'Failed to resolve Telegram link': { en: 'Failed to resolve Telegram link', 'ur-roman': 'Telegram link resolve nahi ho saka', ur: 'ٹیلیگرام لنک حل کرنے میں ناکام' },
  'An error occurred predicting Telegram link': { en: 'An error occurred predicting Telegram link', 'ur-roman': 'Telegram link mein error aagaya', ur: 'ٹیلیگرام لنک کی پیش گوئی کرتے وقت ایک خامی پیش آگئی' },
  'Telegram Link Error': { en: 'Telegram Link Error', 'ur-roman': 'Telegram Link Error', ur: 'ٹیلیگرام لنک کی خامی' },
  'An error occurred fetching Telegram link': { en: 'An error occurred fetching Telegram link', 'ur-roman': 'Telegram link fetch karne mein error aaya', ur: 'ٹیلیگرام لنک لاتے وقت ایک خامی پیش آگئی' },
  'Telegram Download': { en: 'Telegram Download', 'ur-roman': 'Telegram Download', ur: 'ٹیلیگرام ڈاؤن لوڈ' },

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
  const [isTranslating, setIsTranslating] = useState(false);
  
  const pendingTranslations = useRef<Map<string, { resolve: (val: string) => void, reject: (err: any) => void }>>(new Map());
  const inFlightTranslations = useRef<Map<string, Promise<string>>>(new Map());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    safeStorage.setItemAsync('app_language', lang);
  };

  const t = (key: string): string => {
    if (language === 'en') return key;
    return translations[key]?.[language] || key;
  };

  const executeBatchTranslation = async () => {
    if (pendingTranslations.current.size === 0) return;

    const itemsToTranslate = Array.from(pendingTranslations.current.entries());
    pendingTranslations.current.clear();
    
    setIsTranslating(true);
    
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
      } else {
        itemsToTranslate.forEach(([text, { resolve }]) => resolve(text));
      }
    } catch (e) {
      console.error("Batch translation failed", e);
      itemsToTranslate.forEach(([text, { resolve }]) => resolve(text));
    } finally {
      setIsTranslating(false);
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
    
    // Filter and unique texts
    const validTexts = Array.from(new Set(texts.filter(t => t && t.trim() !== "")));
    if (validTexts.length === 0) return texts;

    // Trigger all translations to be added to pending
    const promises = validTexts.map(text => translate(text));
    
    // Force an immediate batch execution for these specific texts
    // We wait a tiny bit to let the microtask queue process the translate calls
    await new Promise(resolve => setTimeout(resolve, 0));
    
    if (pendingTranslations.current.size > 0) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      executeBatchTranslation();
    }
    
    const results = await Promise.all(promises);
    
    // Map back to original order
    const resultsMap = new Map<string, string>();
    validTexts.forEach((text, i) => resultsMap.set(text, results[i]));
    
    return texts.map(text => resultsMap.get(text) || text);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, translate, translateMany, t, isTranslating }}>
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
