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
  'Join Now': { en: 'Join Now', 'ur-roman': 'Abhi Join Karein', ur: 'ابھی جوائن کریں' },
  'Trending Movies': { en: 'Trending Movies', 'ur-roman': 'Trending Movies', ur: 'ٹرینڈنگ موویز' },

  'Rewards & Referrals': { en: 'Rewards & Referrals', 'ur-roman': 'Inamat aur Referrals', ur: 'انعامات اور ریفرلز' },
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
  'Get 5 days of premium membership for free on MovizNow!': { en: 'Get 5 days of premium membership for free on MovizNow!', 'ur-roman': 'MovizNow par 5 din ki premium membership muft haasil karein!', ur: 'MovizNow پر 5 دن کی پریمیم ممبرشپ مفت حاصل کریں!' },
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
  'No Contact Info': { en: 'No Contact Info', 'ur-roman': 'Rabtay ki maloomat nahi', ur: 'کوئی رابطہ معلومات نہیں' },

  'Free movie download sites in Pakistan are illegal, full of viruses, popups aur VPN ki zaroorat hoti hai.': { en: 'Free movie download sites in Pakistan are illegal, full of viruses, popups aur VPN ki zaroorat hoti hai.', 'ur-roman': 'Pakistan mein free movie download sites ghair kanooni hain, virus se bhari hain, popups aate hain aur VPN ki zaroorat hoti hai.', ur: 'پاکستان میں مفت مووی ڈاؤن لوڈ سائٹس غیر قانونی ہیں، وائرس سے بھری ہیں، پاپ اپس آتے ہیں اور وی پی این کی ضرورت ہوتی ہے۔' },
  'Safe legal alternative hai — full HD Bollywood, Hollywood, Punjabi aur Pakistani movies sirf PKR 50 me, seedha WhatsApp par delivery. Ek biscuit ki price me poori HD movie.': { en: 'Safe legal alternative hai — full HD Bollywood, Hollywood, Punjabi aur Pakistani movies sirf PKR 50 me, seedha WhatsApp par delivery. Ek biscuit ki price me poori HD movie.', 'ur-roman': 'Ye ek mehfooz kanooni mutabadil hai — full HD Bollywood, Hollywood, Punjabi aur Pakistani movies sirf PKR 50 mein, seedha WhatsApp par delivery. Ek biscuit ki qeemat mein poori HD movie.', ur: 'یہ ایک محفوظ قانونی متبادل ہے — فل ایچ ڈی بالی ووڈ، ہالی ووڈ، پنجابی اور پاکستانی موویز صرف 50 روپے میں، سیدھا واٹس ایپ پر ڈیلیوری۔ ایک بسکٹ کی قیمت میں پوری ایچ ڈی مووی۔' },


  'Delete Review': { en: 'Delete Review', 'ur-roman': 'Review Delete Karein', ur: 'جائزہ حذف کریں' },
  'No reviews yet. Be the first to review!': { en: 'No reviews yet. Be the first to review!', 'ur-roman': 'Abhi tak koi review nahi. Pehla review ap dein!', ur: 'ابھی تک کوئی جائزہ نہیں۔ پہلا جائزہ آپ دیں!' },


  'Share your experience...': { en: 'Share your experience...', 'ur-roman': 'Apna tajurba share karein...', ur: 'اپنا تجربہ شیئر کریں...' },


  'User Reviews': { en: 'User Reviews', 'ur-roman': 'Users ke Reviews', ur: 'صارفین کے جائزے' },
  'See what others are saying about %APP_NAME%': { en: 'See what others are saying about %APP_NAME%', 'ur-roman': 'Dekhein doosray log %APP_NAME% ke baray mein kya kehte hain', ur: 'دیکھیں کہ دوسرے لوگ %APP_NAME% کے بارے میں کیا کہتے ہیں' },
  'Submit': { en: 'Submit', 'ur-roman': 'Jama Karein', ur: 'جمع کریں' },


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
  'Free piracy sites': { en: 'Free piracy sites', 'ur-roman': 'Free piracy sites', ur: 'مفت پائریسی سائٹس' },
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
  'Write a Review': { en: 'Write a Review', 'ur-roman': 'Review Likhein', ur: 'جائزہ لکھیں' },
  'Your Rating': { en: 'Your Rating', 'ur-roman': 'Aapki Rating', ur: 'آپ کی درجہ بندی' },
  'Your Review': { en: 'Your Review', 'ur-roman': 'Aapka Review', ur: 'آپ کا جائزہ' },
  'Submit Review': { en: 'Submit Review', 'ur-roman': 'Review Bhejein', ur: 'جائزہ جمع کریں' },
  'Update Review': { en: 'Update Review', 'ur-roman': 'Review Update Karein', ur: 'جائزہ اپ ڈیٹ کریں' },
  'Average Rating': { en: 'Average Rating', 'ur-roman': 'Average Rating', ur: 'اوسط درجہ بندی' },
  'Based on %COUNT% reviews': { en: 'Based on %COUNT% reviews', 'ur-roman': '%COUNT% reviews ki bunyad par', ur: '%COUNT% جائزوں کی بنیاد پر' },
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
