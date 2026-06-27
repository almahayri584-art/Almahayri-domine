document.addEventListener('DOMContentLoaded', function() {

  // Sadece mobilde göster
  function checkMobile() {
    var btn = document.getElementById('floatingStoreBtn');
    if (!btn) return;
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
  window.toggleNav = function() {
    const links = document.getElementById('nav-links');
    const btn   = document.getElementById('nav-hamburger');
    links.classList.toggle('open');
    btn.classList.toggle('open');
  }

  window.closeNav = function() {
    document.getElementById('nav-links').classList.remove('open');
    document.getElementById('nav-hamburger').classList.remove('open');
  }

  if (window.location.hash === '#shop' || new URLSearchParams(window.location.search).get('shop') === '1') {
    setTimeout(function() {
      if (typeof openShopSection === 'function') openShopSection();
    }, 300);
  }

});
