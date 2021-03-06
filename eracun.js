//http://stackoverflow.com/questions/11563638/javascript-get-input-text-value
//http://stackoverflow.com/questions/5700471/set-value-of-input-using-javascript-function
//http://stackoverflow.com/questions/19035373/how-do-i-redirect-in-expressjs-while-passing-some-context
//http://blog.modulus.io/nodejs-and-sqlite
//Priprava knjižnic
var formidable = require("formidable");
var util = require('util');

if (!process.env.PORT)
  process.env.PORT = 8080;

// Priprava povezave na podatkovno bazo
var sqlite3 = require('sqlite3').verbose();
var pb = new sqlite3.Database('chinook.sl3');

// Priprava strežnika
var express = require('express');
var expressSession = require('express-session');
var streznik = express();
streznik.set('view engine', 'ejs');
streznik.use(express.static('public'));
streznik.use(
  expressSession({
    secret: '1234567890QWERTY', // Skrivni ključ za podpisovanje piškotkov
    saveUninitialized: true,    // Novo sejo shranimo
    resave: false,              // Ne zahtevamo ponovnega shranjevanja
    cookie: {
      maxAge: 3600000           // Seja poteče po 60min neaktivnosti
    }
  })
);

var razmerje_usd_eur = 0.877039116;

function davcnaStopnja(izvajalec, zanr) {
  switch (izvajalec) {
    case "Queen": case "Led Zepplin": case "Kiss":
      return 0;
    case "Justin Bieber":
      return 22;
    default:
      break;
  }
  switch (zanr) {
    case "Metal": case "Heavy Metal": case "Easy Listening":
      return 0;
    default:
      return 9.5;
  }
}


// Prikaz seznama pesmi na strani
streznik.get('/', function(zahteva, odgovor) {
  //II. del
  //session.var je undefind ce potece ali ni nastavleno direktno
  //console.log(stranka);
  //console.log(zahteva.session.stranka);
  if(zahteva.session.stranka === undefined){ //|| zahteva.session.stranka == false
    odgovor.redirect('/prijava');
  }else{//
    pb.all("SELECT Track.TrackId AS id, Track.Name AS pesem, \
            Artist.Name AS izvajalec, Track.UnitPrice * " +
            razmerje_usd_eur + " AS cena, \
            COUNT(InvoiceLine.InvoiceId) AS steviloProdaj, \
            Genre.Name AS zanr \
            FROM Track, Album, Artist, InvoiceLine, Genre \
            WHERE Track.AlbumId = Album.AlbumId AND \
            Artist.ArtistId = Album.ArtistId AND \
            InvoiceLine.TrackId = Track.TrackId AND \
            Track.GenreId = Genre.GenreId \
            GROUP BY Track.TrackId \
            ORDER BY steviloProdaj DESC, pesem ASC \
            LIMIT 100", function(napaka, vrstice) {
      if (napaka)
        odgovor.sendStatus(500);
      else {
          for (var i=0; i<vrstice.length; i++)
            vrstice[i].stopnja = davcnaStopnja(vrstice[i].izvajalec, vrstice[i].zanr);
          odgovor.render('seznam', {seznamPesmi: vrstice});
        }
    })
  }
})

// Dodajanje oz. brisanje pesmi iz košarice
streznik.get('/kosarica/:idPesmi', function(zahteva, odgovor) {
  var idPesmi = parseInt(zahteva.params.idPesmi);
  if (!zahteva.session.kosarica)
    zahteva.session.kosarica = [];
  if (zahteva.session.kosarica.indexOf(idPesmi) > -1) {
    zahteva.session.kosarica.splice(zahteva.session.kosarica.indexOf(idPesmi), 1);
  } else {
    zahteva.session.kosarica.push(idPesmi);
  }
  
  odgovor.send(zahteva.session.kosarica);
});

// Vrni podrobnosti pesmi v košarici iz podatkovne baze
var pesmiIzKosarice = function(zahteva, callback) {
  if (!zahteva.session.kosarica || Object.keys(zahteva.session.kosarica).length == 0) {
    callback([]);
  } else {
    pb.all("SELECT Track.TrackId AS stevilkaArtikla, 1 AS kolicina, \
    Track.Name || ' (' || Artist.Name || ')' AS opisArtikla, \
    Track.UnitPrice * " + razmerje_usd_eur + " AS cena, 0 AS popust, \
    Genre.Name AS zanr \
    FROM Track, Album, Artist, Genre \
    WHERE Track.AlbumId = Album.AlbumId AND \
    Artist.ArtistId = Album.ArtistId AND \
    Track.GenreId = Genre.GenreId AND \
    Track.TrackId IN (" + zahteva.session.kosarica.join(",") + ")",
    function(napaka, vrstice) {
      if (napaka) {
        callback(false);
      } else {
        for (var i=0; i<vrstice.length; i++) {
          vrstice[i].stopnja = davcnaStopnja((vrstice[i].opisArtikla.split(' (')[1]).split(')')[0], vrstice[i].zanr);
        }
        callback(vrstice);
      }
    })
  }
}

streznik.get('/kosarica', function(zahteva, odgovor) {
  pesmiIzKosarice(zahteva, function(pesmi) {
    if (!pesmi)
      odgovor.sendStatus(500);
    else
      odgovor.send(pesmi);
  });
})

// Vrni podrobnosti pesmi na računu
var pesmiIzRacuna = function(racunId, callback) {
    pb.all("SELECT Track.TrackId AS stevilkaArtikla, 1 AS kolicina, \
    Track.Name || ' (' || Artist.Name || ')' AS opisArtikla, \
    Track.UnitPrice * " + razmerje_usd_eur + " AS cena, 0 AS popust, \
    Genre.Name AS zanr \
    FROM Track, Album, Artist, Genre \
    WHERE Track.AlbumId = Album.AlbumId AND \
    Artist.ArtistId = Album.ArtistId AND \
    Track.GenreId = Genre.GenreId AND \
    Track.TrackId IN (SELECT InvoiceLine.TrackId FROM InvoiceLine, Invoice \
    WHERE InvoiceLine.InvoiceId = Invoice.InvoiceId AND Invoice.InvoiceId = " + racunId + ")",
    function(napaka, vrstice) {
      //III.del
      //console.log(vrstice);
      if (napaka) {
        callback(false);
      } else {
        for (var i=0; i<vrstice.length; i++) {
          vrstice[i].stopnja = davcnaStopnja((vrstice[i].opisArtikla.split(' (')[1]).split(')')[0], vrstice[i].zanr);
        }
        callback(vrstice);
      }
      //
    })
}

// Vrni podrobnosti o stranki iz računa
var strankaIzRacuna = function(racunId, callback) {
    pb.all("SELECT Customer.* FROM Customer, Invoice \
            WHERE Customer.CustomerId = Invoice.CustomerId AND Invoice.InvoiceId = " + racunId,
    function(napaka, vrstice) {
      //III.del
      //console.log(vrstice);
      if (napaka) {
        callback(false);
      } else {
        /*for (var i=0; i<vrstice.length; i++) {
          vrstice[i].stopnja = davcnaStopnja((vrstice[i].opisArtikla.split(' (')[1]).split(')')[0], vrstice[i].zanr);
        }*/
        callback(vrstice);
      }
      //
    })
}

//IV. del
// Vrni podrobnosti o stranki iz računa
var strankaIzID = function(strankaID, callback) {
    pb.all("SELECT Customer.* FROM Customer WHERE Customer.CustomerId = " + strankaID,
    function(napaka, vrstice) {
      //console.log(vrstice);
      callback(vrstice);
    })
}
//

// Izpis računa v HTML predstavitvi na podlagi podatkov iz baze
streznik.post('/izpisiRacunBaza', function(zahteva, odgovor) {
  //III.del
  //odgovor.redirect('/prijava?napaka2=true');
  
  var form = new formidable.IncomingForm();
  
  form.parse(zahteva, function (napaka1, polja, datoteke) {
    var id = polja.seznamRacunov;
    ///console.log(id);
    ///odgovor.redirect('/')
    ///strankaIzRacuna(id, function(podrobnosti) {})
    pesmiIzRacuna(id, function(pesmi) {
      ///console.log(pesmi);
      if (!pesmi) {
        odgovor.sendStatus(500);
      } else if (pesmi.length == 0) {
        odgovor.send("<p>V košarici nimate nobene pesmi, \
          zato računa ni mogoče pripraviti!</p>");
      } else {
        ///console.log("yes");
        strankaIzRacuna(id, function(podrobnosti) {
          ///console.log(podrobnosti);
          if (!podrobnosti) {
            odgovor.sendStatus(500);
          } else if (podrobnosti.length == 0) {
            odgovor.send("<p>V košarici nimate nobene pesmi, \
              zato računa ni mogoče pripraviti!</p>");
          } else {
              odgovor.setHeader('content-type', 'text/xml');
              odgovor.render('eslog', {
                vizualiziraj: true,
                postavkeRacuna: pesmi,
                postavkeRacunaPodrobnosti: podrobnosti
              })
          }
          ///odgovor.redirect("/");
          //odgovor.end(); //odkomentiraj, virtualizacija asinhrono..se prej lahko pozene
        })
      }
    })
  });
  //
})

// Izpis računa v HTML predstavitvi ali izvorni XML obliki
streznik.get('/izpisiRacun/:oblika', function(zahteva, odgovor) {
  pesmiIzKosarice(zahteva, function(pesmi) {
    if (!pesmi) {
      odgovor.sendStatus(500);
    } else if (pesmi.length == 0) {
      odgovor.send("<p>V košarici nimate nobene pesmi, \
        zato računa ni mogoče pripraviti!</p>");
    } else {
      // IV. del
      /*odgovor.setHeader('content-type', 'text/xml');
      odgovor.render('eslog', {
        vizualiziraj: zahteva.params.oblika == 'html' ? true : false,
        postavkeRacuna: pesmi
      })*/
      strankaIzID(zahteva.session.stranka, function(podrobnosti) {
          if (!podrobnosti) {
            odgovor.sendStatus(500);
          } else if (podrobnosti.length == 0) {
            odgovor.send("<p>V košarici nimate nobene pesmi, \
              zato računa ni mogoče pripraviti!</p>");
          } else {
              odgovor.setHeader('content-type', 'text/xml');
              odgovor.render('eslog', {
                vizualiziraj: zahteva.params.oblika == 'html' ? true : false,
                postavkeRacuna: pesmi,
                postavkeRacunaPodrobnosti: podrobnosti
              })
          }
         
        })
      //
    }
  })
})

// Privzeto izpiši račun v HTML obliki
streznik.get('/izpisiRacun', function(zahteva, odgovor) {
  odgovor.redirect('/izpisiRacun/html')
})

// Vrni stranke iz podatkovne baze
var vrniStranke = function(callback) {
  pb.all("SELECT * FROM Customer",
    function(napaka, vrstice) {
      callback(napaka, vrstice);
    }
  );
}

// Vrni račune iz podatkovne baze
var vrniRacune = function(callback) {
  pb.all("SELECT Customer.FirstName || ' ' || Customer.LastName || ' (' || Invoice.InvoiceId || ') - ' || date(Invoice.InvoiceDate) AS Naziv, \
          Invoice.InvoiceId \
          FROM Customer, Invoice \
          WHERE Customer.CustomerId = Invoice.CustomerId",
    function(napaka, vrstice) {
      callback(napaka, vrstice);
    }
  );
}

// Registracija novega uporabnika
streznik.post('/prijava', function(zahteva, odgovor) {
  var form = new formidable.IncomingForm();
  
  form.parse(zahteva, function (napaka1, polja, datoteke) {
    var napaka2 = false;
    try {
      var stmt = pb.prepare("\
        INSERT INTO Customer \
    	  (FirstName, LastName, Company, \
    	  Address, City, State, Country, PostalCode, \
    	  Phone, Fax, Email, SupportRepId) \
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
      //TODO: add fields and finalize
      //stmt.run("", "", "", "", "", "", "", "", "", "", "", 3); 
      //stmt.finalize();
      /*var firstname = document.getElementById("FirstName").value;
      var lastname = document.getElementById("LastName").value;
      var company = document.getElementById("Company").value;
      var address = document.getElementById("Address").value;
      var city = document.getElementById("City").value;
      var state = document.getElementById("State").value;
      var country = document.getElementById("Country").value;
      var postalcode = document.getElementById("PostalCode").value;
      var phone = document.getElementById("Phone").value;
      var fax = document.getElementById("Fax").value;
      var email = document.getElementById("Email").value;*/
      var firstname = polja.FirstName;
      var lastname = polja.LastName;
      var company = polja.Company;
      var address = polja.Address;
      var city = polja.City;
      var state = polja.State;
      var country = polja.Country;
      var postalcode = polja.PostalCode;
      var phone = polja.Phone;
      var fax = polja.Fax;
      var email = polja.Email;
      var supportrepid = 3;
      //stmt.run("sadsa", "das", "dsa", "dsa", "dsa", "das", "das", "das", "dsa", "das", "das", 3); 
      stmt.run(firstname, lastname, company, address, city, state, country, postalcode, phone, fax, email, supportrepid);
      stmt.finalize();
      
    } catch (err) {
      napaka2 = true;
    }

    /*if(napaka2){
      //document.getElementById("sporocilo").value = "Prišlo je do napake pri registraciji nove stranke. Prosim preverite vnešene podatke in poskusite znova.";
      odgovor.redirect('/prijava?napaka2=true');
    }else{
      //document.getElementById("sporocilo").value = "Stranka je bila uspešno registrirana.";
      //odgovor.redirect('/prijava?napaka2=false');  
    }*/
    var napaka3 = napaka2;
    vrniStranke(function(napaka1, stranke) {
      vrniRacune(function(napaka2, racuni) {
        if(napaka3){
          odgovor.render('prijava', {sporocilo: "Prišlo je do napake pri registraciji nove stranke. Prosim preverite vnešene podatke in poskusite znova.", seznamStrank: stranke, seznamRacunov: racuni}); 
        }else{
          odgovor.render('prijava', {sporocilo: "Stranka je bila uspešno registrirana.", seznamStrank: stranke, seznamRacunov: racuni}); 
        }
        odgovor.end();
      }) 
    });
  
  });
})

// Prikaz strani za prijavo
streznik.get('/prijava', function(zahteva, odgovor) {
  
  vrniStranke(function(napaka1, stranke) {
      vrniRacune(function(napaka2, racuni) {
        odgovor.render('prijava', {sporocilo: "", seznamStrank: stranke, seznamRacunov: racuni});  
        /*var napaka3 = zahteva.query.napaka2;
        if(napaka3 == "true"){
          odgovor.render('prijava', {sporocilo: "Prišlo je do napake pri registraciji nove stranke. Prosim preverite vnešene podatke in poskusite znova.", seznamStrank: stranke, seznamRacunov: racuni}); 
        }else if(napaka3 == "false"){
          odgovor.render('prijava', {sporocilo: "Stranka je bila uspešno registrirana.", seznamStrank: stranke, seznamRacunov: racuni}); 
        }else{
          odgovor.render('prijava', {sporocilo: "", seznamStrank: stranke, seznamRacunov: racuni});  
        }*/
      }) 
    });
})

// Prikaz nakupovalne košarice za stranko
streznik.post('/stranka', function(zahteva, odgovor) {
  var form = new formidable.IncomingForm();
  
  form.parse(zahteva, function (napaka1, polja, datoteke) {
    //II. + IV. del
    if(zahteva.session.stranka === undefined){
      zahteva.session.stranka = parseInt(polja.seznamStrank);
    }else{
      ///console.log(zahteva.session.stranka);console.log(parseInt(polja.seznamStrank));
      if(zahteva.session.stranka != parseInt(polja.seznamStrank))
      delete zahteva.session.kosarica;
      //zahteva.session.destroy();  
      //zahteva.session.regenerate();
      zahteva.session.stranka = parseInt(polja.seznamStrank);
    }
    ///console.log(polja);
    ///console.log(zahteva.state);
    //
    odgovor.redirect('/')
  });
})

// Odjava stranke
streznik.post('/odjava', function(zahteva, odgovor) {
    //II. del
    zahteva.session.destroy();     //zahteva.session.stranka = false;
    //
    odgovor.redirect('/prijava') 
})



streznik.listen(process.env.PORT, function() {
  console.log("Strežnik pognan!");
})
