# הוראות פריסה - Panel Cloud

## שלב 1: יצירת Google Sheet

1. לך ל-https://sheets.new
2. שם הגיליון: "Secretary State"
3. צור 4 sheets: `meta`, `drafts`, `inbox`, `audit`
4. העתק את ה-ID מה-URL (`docs.google.com/spreadsheets/d/AAAA/edit` → ה-AAAA)

## שלב 2: יצירת Apps Script

1. בגיליון: Extensions → Apps Script
2. מחק את הקוד הקיים
3. הדבק את `panel-cloud/apps-script/Code.gs`
4. שנה `SHEET_ID = 'REPLACE_WITH_SHEET_ID'` → ה-ID שהעתקת
5. הרץ פעם אחת את `initSheets()` (לאשר הרשאות)
6. File → Project Properties → Script Properties:
   - Add: `PUSH_TOKEN` = `<בחר טוקן רנדומלי 32 תווים>`
7. Deploy → New deployment → Type: Web app:
   - Execute as: Me (יוסף)
   - Who has access: **Anyone**
   - Deploy
8. העתק את ה-URL שמתחיל ב-`https://script.google.com/macros/s/.../exec`

## שלב 3: יצירת GitHub repo

```bash
gh repo create maale-amos/secretary-panel --public --enable-pages
cd panel-cloud
git init && git add . && git commit -m "init"
git remote add origin https://github.com/maale-amos/secretary-panel.git
git push -u origin main
```

ב-`index.html`, עדכן או הוסף לפני `<script src="app.js">`:
```html
<script>
window.SECRETARY_API_URL = 'https://script.google.com/macros/s/XXX/exec';
</script>
```

GitHub Pages: Settings → Pages → Source: `main` branch, `/` root.
תוך 1-2 דקות יהיה זמין ב-`https://maale-amos.github.io/secretary-panel/`.

## שלב 4: הגדרת secrets במחשב הביתי

ערוך `C:\projects\personal-secretary\secrets.json` והוסף:

```json
"cloud_panel": {
  "apps_script_url": "https://script.google.com/macros/s/XXX/exec",
  "push_token": "<אותו טוקן שהגדרת ב-Script Properties>"
}
```

## שלב 5: הפעלת הסנכרון

הסנכרון אוטומטי כשcoreloop.py רץ:
- `sync/to_sheet.py` רץ כל סבב (3 דק') — דוחף נתונים ל-Sheet
- `sync/from_sheet.py` רץ כל סבב — קורא אישורים/דחיות מה-Sheet

לבדיקה ידנית:
```cmd
cd C:\projects\personal-secretary
python -m sync.to_sheet
python -m sync.from_sheet
```

## בעיות נפוצות

- **"unknown action" באישור**: ודא שהדפלוי עודכן אחרי שינוי הקוד
- **CORS error**: Apps Script מדפלוי ב-"text/plain" content-type, לא application/json (חשוב!)
- **invalid token**: PUSH_TOKEN ב-Script Properties חייב להיות זהה ל-push_token ב-secrets.json
- **דפים לא רואים אחד את השני**: ודא ש-Apps Script Deploy עם access=Anyone
