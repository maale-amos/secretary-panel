# Panel Cloud - GitHub Pages

פאנל ענן לניהול המזכיר האישי - נגיש מכל מחשב.

## ארכיטקטורה

```
Browser (כל מחשב)
   ↓ HTTPS
GitHub Pages (HTML/CSS/JS - סטטי)
   ↓ fetch
Apps Script Web App (API)
   ↓
Google Sheet "secretary_state"  ← מסונכרן כל 3 דק' מהמחשב הביתי
   ↑ קריאה כל סבב
SQLite מקומי במחשב (secretary.db)
   ↓
loop.py + sender.py
```

## זרימת אישור טיוטה

1. יוסף נכנס מהטלפון/מחשב אחר ל-`https://maale-amos.github.io/secretary-panel/`
2. הפאנל קורא דרך Apps Script API את הטיוטות מ-Sheet
3. יוסף לוחץ "אשר #1"
4. Apps Script מסמן ב-Sheet: draft #1 → approved=TRUE, approved_by=panel-cloud
5. במחשב הביתי, `sync/from_sheet.py` רץ כל 3 דק', קורא ב-Sheet, מסמן draft=approved ב-SQLite
6. `core/sender.py` שולח את המייל

## קבצים

- `index.html` - דף הפאנל (RTL עברית)
- `app.js` - לוגיקה
- `style.css` - עיצוב
- `apps-script/Code.gs` - Apps Script Backend
- `apps-script/appsscript.json` - manifest

## סנכרון (במחשב)

- `sync/to_sheet.py` - דוחף את secretary.db ל-Sheet (כל 3 דק')
- `sync/from_sheet.py` - קורא אישורים מה-Sheet בחזרה ל-SQLite (כל סבב)
