# Bulk Account Import

How to create many student or teacher accounts at once from a spreadsheet,
instead of adding them one at a time.

Admin only. Find it on **Students → Import CSV** or **Teachers → Import CSV**.

---

## Contents

1. [How it works](#how-it-works)
2. [Before you start](#before-you-start)
3. [Student columns](#student-columns)
4. [Teacher columns](#teacher-columns)
5. [Parents and siblings](#parents-and-siblings)
6. [Passwords](#passwords)
7. [What the checker rejects](#what-the-checker-rejects)
8. [Limits](#limits)
9. [Worked example](#worked-example)
10. [Questions people ask](#questions-people-ask)

---

## How it works

Three steps. **Nothing is created until step 3.**

```
1. Choose a file   →   2. Review every row   →   3. Import
   (.csv)              (nothing written yet)      (accounts created,
                                                   emails sent)
```

Step 2 is the point of the whole thing. The system reads your file and shows
you a table with one line per row, each marked **Ready** or rejected with the
reason. A file of two hundred students will have a typo in it somewhere, and
it is far better to find that before any accounts exist than afterwards.

If some rows are rejected, you can still import the good ones — the rejected
rows are skipped entirely and nothing about them is created. Fix them in your
spreadsheet and upload again; the ones already imported will be rejected the
second time as duplicates, so you cannot accidentally create anyone twice.

---

## Before you start

**Save your spreadsheet as CSV.** In Excel: *File → Save As → CSV (Comma
delimited) (\*.csv)*. In Google Sheets: *File → Download → Comma Separated
Values (.csv)*.

**Download the template.** The Import dialog has a *Download the … template*
button. It gives you a file with the correct column headings and a filled-in
example row, which is the quickest way to get the format right.

**Classes must already exist.** If you are going to put students in JSS 1, the
class JSS 1 has to exist in the portal first, spelled the same way. Sections
work the same — section A must be a section of the class you named.

### About the column headings

Headings are matched loosely, so you do not have to match our spelling
exactly. All of these are read as the same column:

```
First Name      firstname      FIRST_NAME      first-name      firstName
```

Capitals, spaces, underscores and hyphens are all ignored.

**Extra columns are ignored, not rejected.** If your spreadsheet has a "House"
or "Old School" column we do not use, leave it in — it does no harm.

Column **order does not matter**.

---

## Student columns

### Required

| Column | Example | Notes |
| --- | --- | --- |
| `firstname` | Ada | |
| `lastname` | Obi | |
| `email` | ada.obi@example.com | Must be unique. This is where the password is sent. |

### Optional

| Column | Example | Notes |
| --- | --- | --- |
| `phone` | 08030000000 | |
| `class` | JSS 1 | Must already exist, spelled the same way |
| `section` | A | Must be a section of that class. Needs `class` filled in too. |
| `gender` | Female | Male, Female or Other |
| `dateofbirth` | 2013-04-12 | `YYYY-MM-DD` or `DD/MM/YYYY`. Cannot be in the future. |
| `address` | 12 Broad Street, Lagos | Wrap in quotes if it contains a comma |
| `parentfirstname` | Chinwe | See [Parents and siblings](#parents-and-siblings) |
| `parentlastname` | Obi | |
| `parentemail` | chinwe.obi@example.com | Required if any parent column is filled |
| `parentphone` | 08030000009 | |
| `parentrelationship` | Mother | Father, Mother, Guardian or Other |

**Admission numbers are generated for you.** Do not put them in the file —
every imported student gets one automatically.

---

## Teacher columns

### Required

| Column | Example |
| --- | --- |
| `firstname` | Ngozi |
| `lastname` | Eze |
| `email` | ngozi.eze@example.com |

### Optional

| Column | Example |
| --- | --- |
| `phone` | 08030000001 |
| `qualification` | B.Ed Mathematics |
| `specialization` | Mathematics |
| `designation` | Senior Teacher |

**Staff IDs are generated for you**, the same way admission numbers are.

Subjects taught and class-teacher assignments are **not** part of the import —
set those on the Teachers page after the accounts exist.

---

## Parents and siblings

A parent goes on the **student's row**. There is no separate parents file.

Filling in *any* parent column makes `parentemail` required — an account
cannot exist without somewhere to send its password.

### Two children, one parent

To link siblings to the same parent, put the **same `parentemail`** on both
rows:

```csv
firstname,lastname,email,class,parentfirstname,parentlastname,parentemail
Ada,Obi,ada.obi@example.com,JSS 1,Chinwe,Obi,chinwe.obi@example.com
Emeka,Obi,emeka.obi@example.com,JSS 2,Chinwe,Obi,chinwe.obi@example.com
```

That creates **one** parent account, linked to **both** children. Repeat the
address for a third and fourth child the same way.

### If the parent already has an account

Just put their email in `parentemail` and leave the name columns blank. The
existing account is found and the child is linked to it. Their password is not
changed and they are not emailed again.

This is the opposite of how student emails work, and it is deliberate:

| The address already exists | In `email` (the student) | In `parentemail` |
| --- | --- | --- |
| Belongs to a parent | Row rejected — duplicate | **Linked to the existing parent** |
| Belongs to a teacher or admin | Row rejected | Row rejected |

An address can only ever belong to one account, so an address already used by
a teacher cannot also become a parent.

### Parents are optional

Leave every parent column blank and the student is created with no parent
attached. You can link one later on the **Parents** page, which has a list of
students who have no parent yet.

---

## Passwords

You do not set passwords, and you never see them.

Every new account gets its own randomly generated password, sent to them in a
welcome email along with their login link. The password is never written into
the spreadsheet, never shown on screen, and never stored anywhere we can read
it back.

Generated passwords leave out characters that get misread off a printed page —
no capital O or zero, no lowercase L, capital I or the digit one.

**This means every row needs a real email address that someone can open.** If a
student has no email of their own, use a parent's or a school-issued one. An
account whose welcome email goes nowhere cannot be logged into, and the only
way back is a password reset — which also needs a working address.

---

## What the checker rejects

### Problems with the whole file

| Message | What to do |
| --- | --- |
| The file is empty. | The file has no content — check you saved it as CSV. |
| The file has a header row but no data. | Only headings, no rows underneath. |
| The file is missing required column: … | Add the named column. Download the template to compare. |
| The file has N rows. Import at most 1000 at a time. | Split it into smaller files. |
| Upload a .csv file. Save your spreadsheet as CSV first. | It is still an `.xlsx`. Save as CSV. |

### Problems with a single row

The row is skipped; everything else still imports.

| Message | What it means |
| --- | --- |
| `firstname` is required | The cell is empty. |
| email is not a valid address | Missing `@`, a stray space, or a typo. |
| email already has an account | Someone in the portal already uses it. |
| email appears more than once in this file | Two rows share an address. Only one account can have it. |
| class "…" does not exist | No class by that name. Check the spelling against the Classes page. |
| section "…" is not in … | The class exists but has no such section. |
| section given without a class | Fill in `class` too, or clear `section`. |
| gender must be one of Male, Female, Other | Anything else is not accepted. |
| dateOfBirth must be YYYY-MM-DD or DD/MM/YYYY | Reformat the column. Excel often rewrites dates — check what it actually saved. |
| dateOfBirth is in the future | Usually a year typo, e.g. 2031 for 2013. |
| parentEmail is required when a parent is named | You filled in a parent column but left the address blank. |
| parentFirstName is required for a new parent | This parent has no account yet, so we need their name. |
| parentLastName is required for a new parent | As above. |
| parentEmail cannot be the same as the student email | One address, one account. |
| parentEmail is used as a student email in this file | The same address appears as a student on another row. |
| parentEmail already belongs to a Teacher account | That address is already spent on another role. |
| parentRelationship must be one of Father, Mother, Guardian, Other | Anything else is not accepted. |

### After you press Import

Almost everything is caught in the review step, but one thing can still go
wrong afterwards:

> **email was taken while this import was being reviewed**

Another admin created that account between your review and your click. The
rest of the file still imports.

---

## Limits

| | |
| --- | --- |
| Rows per file | 1,000 |
| File size | 2 MB |
| File type | `.csv` only |
| Roles | Students and Teachers (parents come in on student rows) |

Admins are not importable. There are few of them and they carry the most
privilege, so they are created one at a time on purpose.

---

## Worked example

Save this as `students.csv` and it will import cleanly, creating two students
and one parent linked to both:

```csv
firstname,lastname,email,phone,class,section,gender,dateofbirth,address,parentfirstname,parentlastname,parentemail,parentphone,parentrelationship
Ada,Obi,ada.obi@example.com,08030000000,JSS 1,A,Female,2013-04-12,"12 Broad Street, Lagos",Chinwe,Obi,chinwe.obi@example.com,08030000009,Mother
Emeka,Obi,emeka.obi@example.com,,JSS 1,B,Male,2011-09-30,"12 Broad Street, Lagos",Chinwe,Obi,chinwe.obi@example.com,08030000009,Mother
```

Two things to notice:

- Emeka's `phone` is empty. Optional columns can be left blank; the commas
  still have to be there.
- The address contains a comma, so it is **wrapped in quotes**. Excel and
  Google Sheets do this for you automatically.

This is exactly what the *Download the template* button gives you.

---

## Questions people ask

**Can I import the same file twice to fix a mistake?**
Yes. Rows that were already created will be rejected as duplicates, so nobody
is created twice. Fix the rejected rows and re-upload.

**Can I use this to update existing students?**
No. The import only creates new accounts. An email that already exists is
rejected. Edit existing records on the Students or Teachers page.

**What if a student has no email address?**
Every account needs one to receive its password. Use a parent's address, or
issue school addresses before importing.

**Can two students share an email address?**
No — one address, one account. Siblings each need their own.

**Do I need to add admission numbers or staff IDs?**
No. They are generated automatically. Leave them out of the file.

**Can I assign subjects or make someone a class teacher in the file?**
Not yet. Import the accounts, then set those on the Teachers page.

**Nothing happened after I chose a file.**
Check it is saved as `.csv` and not `.xlsx`. If it still refuses, open it in a
text editor — the first line should be the column headings, separated by
commas.

**Can I import parents on their own?**
Not currently. A parents-only file would have to identify each child by
admission number, which the import itself generates — so you would have to
import the students, look up the generated numbers, then build a second file.
Putting the parent on the student row avoids that entirely.

---

For the technical side of any of this — the API routes, validation order and
what is written to the audit log — see
[DOCUMENTATION.md](DOCUMENTATION.md#bulk-account-import--usersimport-4-routes-admin-only).
