 // Sadece mobilde göster
  function checkMobile() {
    var btn = document.getElementById('floatingStoreBtn');
    if (window.innerWidth <= 768) {
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  }
  checkMobile();
  window.addEventListener('resize', checkMobile);


  // Scroll effect
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 40);
  });

  // Hamburger toggle
  function toggleNav() {
    const links = document.getElementById('nav-links');
    const btn   = document.getElementById('nav-hamburger');
    links.classList.toggle('open');
    btn.classList.toggle('open');
  }

  function closeNav() {
    document.getElementById('nav-links').classList.remove('open');
    document.getElementById('nav-hamburger').classList.remove('open');
  }


  if (window.location.hash === '#shop' || new URLSearchParams(window.location.search).get('shop') === '1') {
    window.addEventListener('load', function() {
      setTimeout(openShopSection, 300);
    });
  }
