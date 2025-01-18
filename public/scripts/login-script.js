document.addEventListener("DOMContentLoaded", function() {
    const cursor = document.getElementById("cursor");
    const userInput = document.getElementById("userInput");
  
    userInput.addEventListener("input", function() {
      cursor.innerHTML = `<div>C:\\User\\???></div>` + this.value + "<span class='blink'>_</span>";
    });
});
  