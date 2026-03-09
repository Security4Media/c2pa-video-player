// import { C2PAMenu } from './C2paMenu.js';
// import { providerInfoFromSocialId } from './Providers.js';

// //C2PA menu instance
// let c2paMenuInstance = new C2PAMenu();
// export let initializeC2PAMenu = function (videoPlayer, c2paMenu) {
//   const MenuButton = videojs.getComponent('MenuButton');
//   const MenuItem = videojs.getComponent('MenuItem');

//   class C2PAMenuButton extends MenuButton {
//     createItems() {
//       // Must return an array of `MenuItem`s
//       // Options passed in `addChild` are available at `this.options_`
//       return this.options_.myItems.map((i) => {
//         let item = new MenuItem(this.player_, { label: i.name });
//         item.handleClick = function () {
//           //No click behavior implemented for now
//           return;
//         };
//         return item;
//       });
//     }

//     handleClick() {
//       if (this.buttonPressed_) {
//         this.closeC2paMenu = true;
//         this.unpressButton();
//       } else {
//         this.pressButton();
//       }
//     }

//     unpressButton() {
//       if (this.closeC2paMenu) {
//         this.closeC2paMenu = false;
//         super.unpressButton();
//       }
//     }

//     buildCSSClass() {
//       return `vjs-chapters-button`; //Add icon to menu
//     }
//   }

//   // Register as a component, so it can be added
//   videojs.registerComponent('C2PAMenuButton', C2PAMenuButton);

//   //Add items to c2pa menu
//   let myC2PAItems = [];
//   const menuItems = c2paMenuInstance.c2paMenuItems();
//   Object.keys(menuItems).forEach((key) => {
//     const value = menuItems[key];
//     myC2PAItems.push({
//       name: value,
//       id: key,
//     });
//   });

//   // Use `addChild` to add an instance of the new component, with options
//   videoPlayer.controlBar.addChild(
//     'C2PAMenuButton',
//     {
//       controlText: 'Content Credentials',
//       title: 'Content Credentials',
//       myItems: myC2PAItems,
//     },
//     0,
//   ); //0 indicates that the menu button will be the first item in the control bar
// };

// //Adjust c2pa menu size with respect to the player size
// export let adjustC2PAMenu = function (
//   c2paMenu,
//   videoElement,
//   c2paMenuHeightOffset,
// ) {
//   const menuContent = c2paMenu
//     .el()
//     .querySelector('.vjs-menu-button-popup .vjs-menu .vjs-menu-content');

//   const playerWidth = videoElement.offsetWidth;
//   const playerHeight = videoElement.offsetHeight - c2paMenuHeightOffset;

//   menuContent.style.width = `${playerWidth}px`;
//   menuContent.style.height = `${playerHeight}px`;
// };

// //Update the c2pa menu items with the values from the c2pa manifest
// export let updateC2PAMenu = function (
//   c2paStatus,
//   c2paMenu,
//   isMonolithic,
//   videoPlayer,
//   getCompromisedRegions,
// ) {
//   //Get all the c2pa menu items
//   const c2paMenuItems = c2paMenu.items;
//   const compromisedRegions = getCompromisedRegions(isMonolithic, videoPlayer);

//   for (let i = 0; i < c2paMenuItems.length; i++) {
//     //Menu items are organized as key/name + value, separated by a delimiter
//     const c2paItem = c2paMenuItems[i];
//     const c2paItemName = c2paItem.options_.label;
//     const c2paItemKey = c2paItem.options_.id;

//     //Based on the plain name of the menu item, we retrieve the key from the c2paMenuInstance
//     //And based on that key, we get the corresponding value from the c2pa manifest
//     const c2paItemValue = c2paMenuInstance.c2paItem(
//       c2paItemKey,
//       c2paStatus,
//       compromisedRegions,
//     );
//     console.log('[C2PA] Menu item: ', c2paItemName, c2paItemKey, c2paItemValue);

//     if (c2paItemValue != null) {
//       //formatting for social media links
//       if (c2paItemKey === 'SOCIAL') {
//         var socialArray = c2paItemValue.map(function (account) {
//           var formattedWebsite = providerInfoFromSocialId(account).name;
//           return `<span><a class="url" href="${account}" onclick="window.open('${account}')">${formattedWebsite}</a></span>`;
//         });
//         c2paItem.el().innerHTML = `<span class="itemName"> ${c2paItemName} </span> ${c2paMenuInstance.c2paMenuDelimiter()} ${socialArray.join(
//           '\n',
//         )}`;
//       } else if (c2paItemKey === 'WEBSITE') {
//         c2paItem.el().innerHTML = `<div class="itemName"> ${c2paItemName}</div>${c2paMenuInstance.c2paMenuDelimiter()}<a class="url" href="${c2paItemValue}" onclick="window.open('${c2paItemValue}')">${c2paItemValue}</a>`;
//       } else if (c2paItemKey === 'ALERT') {
//         c2paItem.el().innerHTML = `<div class="alert-div"> <img class="alert-icon"></img> <div> ${c2paItemValue} </div></div>`;
//       } else if (
//         c2paItemKey === 'VALIDATION_STATUS' &&
//         c2paItemValue === 'Failed'
//       ) {
//         c2paItem.el().innerHTML = `<span class="itemName nextLine"> ${c2paItemName} </span>`;
//         c2paItem.el().classList.add('validation-padding');
//       }
//       //If the value is not null, we update the menu item text and show it
//       else if (c2paItemValue.length >= 23) {
//         c2paItem.el().innerHTML = `<div class="itemName"> ${c2paItemName}</div>${c2paMenuInstance.c2paMenuDelimiter()}${c2paItemValue}`;
//       } else {
//         c2paItem.el().innerHTML = `<span class="itemName"> ${c2paItemName} </span> ${c2paMenuInstance.c2paMenuDelimiter()} ${c2paItemValue}`;
//       }
//       c2paItem.el().style.display = 'block';
//     } else {
//       //If the value is null, we hide the menu item
//       c2paItem.el().style.display = 'none';
//     }
//   }
// };
// //Hide the c2pa menu
// let hideC2PAMenu = function () {
//   c2paMenu.hide();
// };
import { C2PAMenu } from './C2paMenu.js';
import { providerInfoFromSocialId } from './Providers.js';

//C2PA menu instance
let c2paMenuInstance = new C2PAMenu();
// Store the state of collapsible sections
let cawgIdentityExpanded = false;

export let initializeC2PAMenu = function (videoPlayer) {
  console.log('[C2PAMenu] Initializing C2PA menu, videoPlayer:', videoPlayer);
  console.log('[C2PAMenu] videojs available:', typeof videojs !== 'undefined', window.videojs);

  const MenuButton = videojs.getComponent('MenuButton');
  const MenuItem = videojs.getComponent('MenuItem');

  class C2PAMenuButton extends MenuButton {
    constructor(player, options) {
      super(player, options);
      this.closeC2paMenu = false;
    }

    createItems() {
      // Must return an array of `MenuItem`s
      // Options passed in `addChild` are available at `this.options_`
      return this.options_.myItems.map((i) => {
        let item = new MenuItem(this.player_, { label: i.name, id: i.id });
        item.handleClick = function () {
          //No click behavior implemented for now

          return;
        };
        return item;
      });
    }

    handleClick() {
      if (this.buttonPressed_) {
        this.closeC2paMenu = true;
        this.unpressButton();
      } else {
        this.pressButton();
      }
    }

    unpressButton() {
      if (this.closeC2paMenu) {
        this.closeC2paMenu = false;
        super.unpressButton();
      }
    }

    buildCSSClass() {
      return `vjs-chapters-button c2pa-menu-button ${super.buildCSSClass()}`; // Add both classes for proper styling
    }
  }

  // Register as a component, so it can be added
  videojs.registerComponent('C2PAMenuButton', C2PAMenuButton);

  //Add items to c2pa menu
  let myC2PAItems = [];
  const menuItems = c2paMenuInstance.c2paMenuItems();
  Object.keys(menuItems).forEach((key) => {
    const value = menuItems[key];
    myC2PAItems.push({
      name: value,
      id: key,
    });
  });

  // Use `addChild` to add an instance of the new component, with options
  videoPlayer.controlBar.addChild(
    'C2PAMenuButton',
    {
      controlText: 'Content Credentials',
      title: 'Content Credentials',
      myItems: myC2PAItems,
      className: 'c2pa-menu-button',
    },
    0,
  ); //0 indicates that the menu button will be the first item in the control bar

  console.log('[C2PAMenu] C2PA menu button added to control bar');
  console.log('[C2PAMenu] Control bar children:', videoPlayer.controlBar.children());
};

//Adjust c2pa menu size with respect to the player size
export let adjustC2PAMenu = function (
  c2paMenu,
  videoElement,
  c2paMenuHeightOffset,
) {
  if (!c2paMenu || !c2paMenu.el()) {
    console.warn('[C2PA] Menu not available for adjustment');
    return;
  }

  const menuEl = c2paMenu.el().querySelector('.vjs-menu-button-popup .vjs-menu');
  const menuContent = c2paMenu.el().querySelector('.vjs-menu-button-popup .vjs-menu .vjs-menu-content');

  if (!menuEl || !menuContent) {
    console.warn('[C2PA] Menu elements not found');
    return;
  }

  const playerWidth = videoElement.offsetWidth;
  const playerHeight = videoElement.offsetHeight - c2paMenuHeightOffset;

  // Set menu to cover the video area (excluding control bar)
  menuEl.style.width = `${playerWidth}px`;
  menuEl.style.height = `${playerHeight}px`;
  menuEl.style.top = '0';
  menuEl.style.left = '0';

  // Set content dimensions to match
  menuContent.style.width = `${playerWidth}px`;
  menuContent.style.maxWidth = `${playerWidth}px`;
  menuContent.style.height = `${playerHeight}px`;
  menuContent.style.maxHeight = `${playerHeight}px`;

  console.log('[C2PA] Menu adjusted to cover video area:', { playerWidth, playerHeight });
};

//Update the c2pa menu items with the values from the c2pa manifest
export let updateC2PAMenu = function (
  c2paStatus,
  c2paMenu,
  isMonolithic,
  videoPlayer,
  getCompromisedRegions,
) {
  //Get all the c2pa menu items
  const c2paMenuItems = c2paMenu.items;
  const compromisedRegions = getCompromisedRegions(isMonolithic, videoPlayer);

  for (let i = 0; i < c2paMenuItems.length; i++) {
    //Menu items are organized as key/name + value, separated by a delimiter
    const c2paItem = c2paMenuItems[i];
    const c2paItemName = c2paItem.options_.label;
    const c2paItemKey = c2paItem.options_.id;

    //Based on the plain name of the menu item, we retrieve the key from the c2paMenuInstance
    //And based on that key, we get the corresponding value from the c2pa manifest
    const c2paItemValue = c2paMenuInstance.c2paItem(
      c2paItemKey,
      c2paStatus,
      compromisedRegions,
    );
    console.log('[C2PA] Menu item: ', c2paItemName, c2paItemKey, c2paItemValue);

    if (c2paItemValue != null) {
      //formatting for social media links
      if (c2paItemKey === 'SOCIAL') {
        var socialArray = c2paItemValue.map(function (account) {
          var formattedWebsite = providerInfoFromSocialId(account).name;
          return `<span><a class="url" href="${account}" onclick="window.open('${account}')">${formattedWebsite}</a></span>`;
        });
        c2paItem.el().innerHTML = `<span class="itemName"> ${c2paItemName} </span> ${c2paMenuInstance.c2paMenuDelimiter()} ${socialArray.join(
          '\n',
        )}`;
      } else if (c2paItemKey === 'CAWG_IDENTITY') {
        if (c2paItemValue && typeof c2paItemValue === 'object') {
          // Check if there's an existing state before rebuilding
          const existingContent = c2paItem.el().querySelector('.cawg-identity');
          if (existingContent) {
            cawgIdentityExpanded = existingContent.style.display === 'flex';
          }

          let cawgHtml = `<div class="cawg-identity" style="display: ${cawgIdentityExpanded ? 'flex' : 'none'};">`;

          // Display issuer
          if (c2paItemValue.issuer) {
            cawgHtml += `<div><span class="itemName">Issuer:</span> ${c2paItemValue.issuer}</div>`;
          }

          // Display referenced assertions
          if (c2paItemValue.referenced_assertions) {
            cawgHtml += `<div><span class="itemName">Referenced Assertions:</span> ${c2paItemValue.referenced_assertions}</div>`;
          }
          cawgHtml += '</div>';

          c2paItem.el().innerHTML = `<div class="cawg-header"><span class="itemName">${c2paItemName}</span><span class="cawg-toggle ${cawgIdentityExpanded ? 'expanded' : ''}">›</span></div>${cawgHtml}`;

          // Add click handler for toggle
          const header = c2paItem.el().querySelector('.cawg-header');
          const toggle = c2paItem.el().querySelector('.cawg-toggle');
          const content = c2paItem.el().querySelector('.cawg-identity');

          header.style.cursor = 'pointer';
          header.onclick = function (e) {
            e.stopPropagation();
            if (content.style.display === 'none') {
              content.style.display = 'flex';
              toggle.classList.add('expanded');
              cawgIdentityExpanded = true;
            } else {
              content.style.display = 'none';
              toggle.classList.remove('expanded');
              cawgIdentityExpanded = false;
            }
          };
        } else {
          c2paItem.el().innerHTML = `<span class="itemName"> ${c2paItemName}</span> ${c2paItemValue}`;
        }
      } else if (c2paItemKey === 'WEBSITE') {
        c2paItem.el().innerHTML = `<div class="itemName">${c2paItemName}</div>${c2paMenuInstance.c2paMenuDelimiter()}<a class="url" href="${c2paItemValue}" onclick="window.open('${c2paItemValue}')">${c2paItemValue}</a>`;
      } else if (c2paItemKey === 'ALERT') {
        c2paItem.el().innerHTML = `<div class="alert-div"><img class="alert-icon"></img><div>${c2paItemValue}</div></div>`;
      } else if (
        c2paItemKey === 'C2PA_VALIDATION_STATUS' &&
        c2paItemValue === 'Failed'
      ) {
        c2paItem.el().innerHTML = `<span class="itemName nextLine">${c2paItemName}</span>`;
        c2paItem.el().classList.add('validation-padding');
      }
      //If the value is not null, we update the menu item text and show it
      else if (c2paItemValue.length >= 23) {
        c2paItem.el().innerHTML = `<div class="itemName">${c2paItemName}</div>${c2paMenuInstance.c2paMenuDelimiter()}${c2paItemValue}`;
      } else {
        c2paItem.el().innerHTML = `<span class="itemName">${c2paItemName}</span>${c2paMenuInstance.c2paMenuDelimiter()}${c2paItemValue}`;
      }
      c2paItem.el().style.display = 'block';
    } else {
      //If the value is null, we hide the menu item
      c2paItem.el().style.display = 'none';
    }
  }
};
//Hide the c2pa menu
let hideC2PAMenu = function () {
  c2paMenu.hide();
};
