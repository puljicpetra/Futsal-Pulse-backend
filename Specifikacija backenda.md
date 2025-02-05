# **Futsal Pulse - Specifikacija backenda**

## Opis API-ja i njegova svrha 

API omogućuje komunikaciju između frontenda i backenda aplikacije Futsal Pulse. Služi za upravljanje ključnim funkcionalnostima aplikacije, uključujući: 
- kreiranje i upravljanje turnirima, registraciju timova i igrača 
- pregled i ažuriranje rasporeda utakmica i rezultata u stvarnom vremenu 
- slanje obavijesti i omogućavanje komentara korisnicima 
- pružanje analitičkih podataka i informacija o trenutnim događajima 

API omogućuje organizatorima turnira, igračima i navijačima brzu i sigurnu razmjenu podataka, čime se potiče transparentnost i interakcija unutar ove sportske zajednice. `

## Popis ruta 
##### **`POST` /signup**
- registracija novog korisnika (organizator/igrač/navijač)
- ulazni podaci:
``` javascript
{
    "username": "korisničkoIme",
    "email": "korisnik@email.com",
    "password": "lozinka",
    "role": "igrac"  // ili "organizator", "navijac"
}
```
- izlaz: `res.status(201).send('Uspješna registracija.')` ili `res.status(500).send('Neuspješna registracija.')`

##### **`POST` /login**
- prijava korisnika
- ulazni podaci:
``` javascript
{
    "email": "korisnik@email.com",
    "password": "lozinka"
}
```
- izlaz: `res.status(200).send({ auth: true, token })` ili `res.status(500).send('Greška prilikom prijave.')`

##### **`GET` /user**
- podaci o prijavljenom korisniku
- izlaz: `res.status(200).json({  username: user.username, email: user.email, role: user.role })` ili `res.status(500).send('Greška prilikom dohvaćanja podataka.')`

##### **`POST` /tournaments**
- kreiranje novog turnira (samo organizatori)
- ulazni podaci:
``` javascript
{
    "name": "Moja ulica, moja ekipa",
    "location": {
        "city": "Pula",
        "venue": "Dom sportova Mate Palov",
        "address": "Trg kralja Tomislava 7",
        "capacity": 2312
    },
    "startDate": "2024-12-06",
    "endDate": "2024-12-26",
    "rules": "Pravila turnira..."
}
```
- izlaz: `res.status(201).send('Turnir uspješno kreiran.')` ili `res.status(500).send('Greška prilikom kreiranja turnira.')`

##### **`GET` /tournaments**
- dohvaćanje svih turnira
- izlaz: `res.status(200).json(tournaments)` ili `res.status(500).send('Greška prilikom dohvaćanja turnira.')`

##### **`GET` /tournaments/:id**
- dohvaćanje pojedinog turnira
- izlaz: `res.status(200).json(tournament)` ili `res.status(404).send('Turnir nije pronađen.')`
 
##### **`PATCH` /tournaments/:id**
- ažuriranje podataka o pojedinom turniru (samo organizatori)
- ulazni podaci:
``` javascript
{
    "name": "Novi naziv turnira",
    "startDate": "2024-12-08"
}
```
- izlaz: `res.status(200).send('Turnir uspješno ažuriran.')` ili `res.status(404).send('Turnir nije pronađen.')` ili `res.status(500).send('Greška prilikom ažuriranja turnira.')`

##### **`DELETE` /tournaments/:id**
- brisanje pojedinog turnira (samo organizatori)
- izlaz: `res.status(200).send('Turnir uspješno izbrisan.')` ili `res.status(404).send('Turnir nije pronađen.')` ili `res.status(500).send('Greška prilikom brisanja turnira.')`

##### **`POST` /tournaments/:id/teams**
- dodavanje novog tima na turnir (samo organizatori)
- ulazni podaci:
``` javascript
{
    "name": "Domino Maling",
    "players": ["Igrač1", "Igrač2", "Igrač3"]
}
```
- izlaz: `res.status(201).send('Tim uspješno dodan.')` ili `res.status(500).send('Greška prilikom dodavanja tima.')`

##### **`POST` /tournaments/:id/teams/:teamId/register**
- registracija već postojećeg tima na određeni turnir (samo organizatori)
- izlaz: `res.status(201).send('Tim uspješno dodan.')` ili `res.status(500).send('Greška prilikom dodavanja tima.')`

##### **`GET` /tournaments/:id/teams**
- dohvaćanje svih timova za pojedini turnir
- izlaz: `res.status(200).json(teams)` ili `res.status(500).send('Greška prilikom dohvaćanja timova.')`
 
##### **`POST` /tournaments/:id/matches**
- dodavanje nove utakmice na turnir (samo organizatori)
- ulazni podaci:
``` javascript
{
    "homeTeam": "Domino Maling",
    "awayTeam": "HMRM",
    "date": "2024-12-10T18:00:00",
    "venue": "Dom sportova Mate Parlov"
}
```
- izlaz: `res.status(201).send('Utakmica uspješno dodana.')` ili `res.status(500).send('Greška prilikom dodavanja utakmice.')`

##### **`PATCH` /matches/:id/update-score**
- ažuriranje rezultata utakmice (samo organizatori)
- ulazni podaci:
``` javascript
{
    "homeScore": 6,
    "awayScore": 3
}
```
- izlaz: `res.status(200).send('Rezultat utakmice uspješno ažuriran.')` ili `res.status(404).send('Utakmica nije pronađena.')` ili `res.status(500).send('Greška prilikom ažuriranja rezultata utakmice.')`

##### **`PATCH` /matches/:id/update-player-stats**
- ažuriranje statistike igrča u utakmici (samo organizatori)
- ulazni podaci:
``` javascript
{
    "playerStats": [
        {
            "playerId": "player123",
            "goals": 2,
            "assists": 1,
            "yellowCards": 1
        },
        {
            "playerId": "player456",
            "goals": 1,
            "assists": 0,
            "redCards": 1
        }
    ]
}
```
- izlaz: `res.status(200).send('Statistika igrača uspješno ažurirana.')` ili `res.status(404).send('Utakmica nije pronađena.')` ili `res.status(500).send('Greška prilikom ažuriranja statistike igrača.')`

##### **`GET` /tournaments/:id/matches**
- dohvaćanje svih utakmica za određeni turnir
- izlaz: `res.status(200).json(matches)` ili `res.status(500).send('Greška prilikom dohvaćanja utakmice.')`

##### **`GET` /matches/:id**
- dohvaćanje detalja o pojedinoj utakmici
- izlaz: `res.status(200).json(match)` ili `res.status(404).send('Utakmica nije pronađena.')` ili `res.status(500).send('Greška prilikom dohvaćanja utakmice.')`

##### **`POST` /matches/:id/comments**
- dodavanje komentara na utakmicu (igrači i navijači)
- ulazni podaci:
``` javascript
{
    "comment": "Odlična utakmica!"
}
```
- izlaz: `res.status(201).send('Komentar uspješno dodan.')` ili `res.status(500).send('Greška prilikom dodavanja komentara.')`
 
##### **`GET` /matches/:id/comments**
- dohvaćanje svih komentara za određenu utakmicu
- izlaz: `res.status(200).json(comments)` ili `res.status(500).send('Greška prilikom dohvaćanja komentara.')`

##### **`POST` /tournaments/:id/comments**
- dodavanje komentara na turnir (igrači i navijači)
- ulazni podaci:
``` javascript
{
    "comment": "Sjajan turnir, čestitke organizatorima!"
}
```
- izlaz: `res.status(201).send('Komentar uspješno dodan.')` ili `res.status(500).send('Greška prilikom dodavanja komentara.')`
 
##### **`GET` /tournaments/:id/comments**
- dohvaćanje svih komentara za određeni turnir
- izlaz: `res.status(200).json(comments)` ili `res.status(500).send('Greška prilikom dohvaćanja komentara.')`

##### **`GET` /user/stats**
- dohvaćanje statistike prijavljenog igrača
- izlaz: `res.status(200).json(stats)` ili `res.status(500).send('Greška prilikom dohvaćanja statistike.')`

##### **`GET` /teams/:id**
- dohvaćanje podataka o pojedinom timu, uključujući igrače i njihove statistike
- izlaz: `res.status(200).json(team)` ili `res.status(500).send('Greška prilikom dohvaćanja tima.')`

##### **`GET` /teams/:id/players**
- dohvaćanje svih igrača u timu
- izlaz: `res.status(200).json(players)` ili `res.status(500).send('Greška prilikom dohvaćanja igrača.')`
 
##### **`POST` /teams/:id/players**
- dodavanje novog igrača u tim (samo organizatori)
- ulazni podaci:
``` javascript
{
    "playerId": "player789",
    "name": "Marko Markić",
    "position": "Golman"
}
```
- izlaz: `res.status(201).send('Igrač uspješno dodan.')` ili `res.status(500).send('Greška prilikom dodavanja igrača u tim.')`

##### **`POST` /notifications**
- slanje nove obavijesti (samo organizatori)
- ulazni podaci:
``` javascript
{
    "title": "Promjena termina utakmice",
    "message": "Utakmica između Domino Maling i HMRM pomaknuta je na 20:00.",
    "tournamentId": "tournament123", 
    "matchId": "match456"
}
```
- izlaz: `res.status(201).send('Obavijest uspješno poslana.')` ili `res.status(500).send('Greška prilikom slanja obavijesti.')`

##### **`GET` /notifications**
- dohvaćanje svih obavijesti
- izlaz: `res.status(200).json(notifications)` ili `res.status(500).send('Greška prilikom dohvaćanja obavijesti.')`

##### **`DELETE` /notifications/:id**
- brisanje pojedine obavijesti (samo organizatori)
- izlaz: `res.status(200).send('Obavijest uspješno obrisana.')` ili `res.status(404).send('Obavijest nije pronađena.')` ili `res.status(500).send('Greška prilikom brisanja obavijesti.')`

##### **`POST` /notifications/subscribe**
- pretplata korisnika na obavijesti za određeni turnir ili utakmicu
- ulazni podaci:
``` javascript
{
    "tournamentId": "tournament123",
    "matchId": "match456"
}
```
- izlaz: `res.status(201).send('Pretplata na obavijesti uspješno postavljena.')` ili `res.status(500).send('Greška prilikom postavljanja pretplate.')`

##### **`POST` /notifications/unsubscribe**
- otkazivanje pretplate korisnika na obavijesti
- ulazni podaci:
``` javascript
{
    "tournamentId": "tournament123",
    "matchId": "match456"
}
```
- izlaz: `res.status(201).send('Pretplata na obavijesti uspješno otkazana.')` ili `res.status(500).send('Greška prilikom otkazivanja pretplate.')`