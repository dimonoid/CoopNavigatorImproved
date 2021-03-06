import * as Utils from "./utils";
import * as Config from "./config";

chrome.runtime.onMessage.addListener(function(request: Utils.ChromeMessage, sender, sendResponse: CallableFunction) {
    switch(request.message) {
        case "startScrape":
            preloadJobs();
            break;
    }
});


// Depending on the URL, do different things
Utils.wait(() => Config.config !== undefined, 1000, 10).then((): void => {
    if (!Config.config.extensionEnabled) return;

    if (window.location.pathname.startsWith("/CoopNav.NET/Job/MaintainJob.aspx")) {
        if (window.location.hash.startsWith("#jobNumber=")) {
            goToJobNumber();
        } else {
            prepJobPreload();
        }
    }
});

/**
 * Goes to a specified job number from window.location.hash
 */
async function goToJobNumber() {
    // Search for a jobNumber and load it
    let jobNumber: string = window.location.hash.replace("#jobNumber=", "");
    let jobNumberInput: HTMLTextAreaElement =  
        <HTMLTextAreaElement> document.getElementById("ctl00_mainContainer_uxTabs_ctl03_uxSearchCoopJobNumber");
    let searchButton: HTMLButtonElement = <HTMLButtonElement> document.getElementById("ctl00_mainContainer_uxTabs_ctl03_uxBasicSearch");

    jobNumberInput.value = jobNumber;
    searchButton.click();

    await waitForLoadingIndicator();

    let jobLink: HTMLLinkElement = getJobLink(getJobList()[0]);
    jobLink.click();

    await waitForLoadingIndicator();

    await modifyJobsPage();

    // Modify the form again when it refreshes
    let form = document.getElementById("aspnetForm");
    // This form uses the change event instead of the submit event
    form.addEventListener("change", waitToRemodifyJobsPage);
    form.addEventListener("submit", waitToRemodifyJobsPage);
}

/**
 * Modifies the jobs page after waiting for the loading to finish
 */
async function waitToRemodifyJobsPage() {
    await Utils.wait(() => document.querySelector(".moved-description") === null);

    modifyJobsPage();
}

/**
 * Makes the job page look nice for an iframe
 */
async function modifyJobsPage() {
    // Find and move the description
    //TODO: Support French
    let descriptionContainerFunction = (): HTMLDivElement => <HTMLDivElement> document.querySelector("[for='ctl00_mainContainer_uxTabs_ctl12_uxInfoDescriptionEn']").parentElement;
    // Wait for it to load
    await Utils.wait(() => descriptionContainerFunction() !== null);

    let descriptionContainer: HTMLDivElement = descriptionContainerFunction();

    // Wait for the description iframe to reload
    let descriptionIframeFunction = (): HTMLIFrameElement => <HTMLIFrameElement> descriptionContainer.querySelector("#ctl00_mainContainer_uxTabs_ctl12_uxInfoDescriptionEn_ifr");
    // Wait for it to load
    await Utils.wait(() => descriptionIframeFunction() !== null && descriptionIframeFunction().contentWindow.document.body.children.length > 0);
    let descriptionIframe: HTMLIFrameElement = descriptionIframeFunction();

    descriptionContainer.classList.add("hidden");

    // Hide French description
    let frenchDescriptionContainer: HTMLDivElement = <HTMLDivElement> document.querySelector("[for='ctl00_mainContainer_uxTabs_ctl12_uxInfoDescriptionFr']").parentElement;
    frenchDescriptionContainer.classList.add("hidden");

    // Clone the description to a different location
    let newDescription: HTMLDivElement = <HTMLDivElement> descriptionContainer.cloneNode(true);
    newDescription.classList.add("moved-description");
    newDescription.classList.remove("hidden");

    let jobNumberElement: HTMLDivElement = <HTMLDivElement> document.getElementById("ctl00_mainContainer_uxTabs_ctl12_uxInfoCoopJobGroup");
    jobNumberElement.parentElement.insertBefore(newDescription, jobNumberElement);

    // Copy over Iframe info
    let newDescriptionIframe = (): HTMLIFrameElement => <HTMLIFrameElement> newDescription.querySelector("#ctl00_mainContainer_uxTabs_ctl12_uxInfoDescriptionEn_ifr");
    await Utils.wait(() => newDescriptionIframe().contentWindow !== null && newDescriptionIframe().contentWindow.document.body !== undefined);
    newDescriptionIframe().contentWindow.document.body.innerHTML = descriptionIframe.contentWindow.document.body.innerHTML;

    // Remove Iframe border
    newDescriptionIframe().setAttribute("frameBorder", "0");
    (<HTMLDivElement> newDescription.querySelector(":scope > .mce-tinymce.mce-panel > .mce-container-body > .mce-edit-area"))
                            .style.removeProperty("border-width");

    // Make sure it does not get reset
    Utils.wait(() => newDescriptionIframe().contentWindow.document.body.children.length == 0).then((): void => {
        // Put the info back
        newDescriptionIframe().contentWindow.document.body.innerHTML = descriptionIframe.contentWindow.document.body.innerHTML;
    });

    // Hide "English Description" label
    let descriptionLabel = newDescription.querySelector("[for='ctl00_mainContainer_uxTabs_ctl12_uxInfoDescriptionEn']");
    descriptionLabel.classList.add("hidden");

    // Hide tabs, banner, sidebar and job title
    document.getElementById("ctl00_mainContainer_uxTabs_TabControl").classList.add("hidden");
    document.getElementById("menuDiv").parentElement.classList.add("hidden");
    document.getElementById("contextDiv").classList.add("hidden");
    document.getElementById("ctl00_mainContainer_uxPageTitle").parentElement.classList.add("hidden");

    // Change left margin on main div
    let mainDiv: HTMLDivElement = <HTMLDivElement> document.getElementById("mainDiv");
    mainDiv.style.marginLeft = "0";

    // Create new Apply Button
    let newApplyButtonContainer: HTMLDivElement = document.createElement("div");
    newApplyButtonContainer.id = "new-apply-button";
    newApplyButtonContainer.classList.add("InputGroup");
    let newApplyButton: HTMLLabelElement = document.createElement("label");
    newApplyButton.setAttribute("for", "newApplyButton");
    newApplyButton.classList.add("InputLabel", "new-apply-button");
    newApplyButtonContainer.appendChild(newApplyButton);
    
    // Wait for apply button to be ready
    let oldApplyButtonFunction = (): HTMLLinkElement => <HTMLLinkElement> document.getElementById("ctl00_contextContainer_uxApplyJob");
    await Utils.wait(() => oldApplyButtonFunction() !== null);

    let oldApplyButton: HTMLLinkElement = oldApplyButtonFunction();
    newApplyButton.addEventListener("click", () => oldApplyButton.click());
    newApplyButton.innerText = oldApplyButton.innerText;

    // Add apply button to page
    let jobQualificationsTitle: HTMLDivElement = <HTMLDivElement> document.getElementById("ctl00_mainContainer_uxTabs_ctl12_uxInfoQualification");
    jobQualificationsTitle.parentElement.insertBefore(newApplyButtonContainer, jobQualificationsTitle);

    // Remove two spaces before the apply button
    newApplyButtonContainer.previousElementSibling.classList.add("hidden");
    newApplyButtonContainer.previousElementSibling.previousElementSibling.classList.add("hidden");
}

/**
 * Preloads the jbs once the search button has been clicked
 */
async function prepJobPreload() {
    // Add listener to search button
    let searchButton = () => <HTMLInputElement> document.querySelector("[name='ctl00$mainContainer$uxTabs$ctl03$uxBasicSearch']");

    await Utils.wait(() => searchButton() !== null);

    setupSubmitButtonListener(false);

    // If the form refreshes, set up the button listener again
    let form = document.getElementById("aspnetForm");
    form.addEventListener("submit", jobSearchFormUpdate);
}

/**
 * Listens to form update event on the search page.
 * Will call setupSubmitButtonListener()
 * 
 * @param e
 */
function jobSearchFormUpdate(e: MouseEvent) {
    setupSubmitButtonListener();
}

/**
 * Sets up a listener on the submit button to preload the jobs
 *
 * @param awaitLoadingIndicator If false, it will add the listener right away 
 */
async function setupSubmitButtonListener(awaitLoadingIndicator: boolean = true) {
    if (awaitLoadingIndicator) {
        await waitForLoadingIndicator();
    }

    let searchButton = <HTMLInputElement> document.querySelector("[name='ctl00$mainContainer$uxTabs$ctl03$uxBasicSearch']");
    
    searchButton.addEventListener("click", async function() {
        // Remove old form event listener
        let form = document.getElementById("aspnetForm");
        form.removeEventListener("submit", jobSearchFormUpdate);

        await waitForLoadingIndicator();

        prepJobsListPreloader();
    });
}

/**
 * Calls preloadJobs(), then sets up listeners on form change buttons.
 */
async function prepJobsListPreloader() {
    preloadJobs();

    // Add listeners to the change page buttons
    let updateButtons: Array<HTMLElement> = [];
    updateButtons.push(document.querySelector("[name='ctl00$mainContainer$uxTabs$ctl06$ctl00$ctl00$ctl00']"));
    updateButtons.push(document.querySelector("[name='ctl00$mainContainer$uxTabs$ctl06$ctl00$ctl00$ctl01']"));
    updateButtons.push(document.querySelector("[name='ctl00$mainContainer$uxTabs$ctl06$ctl00$ctl00$ctl02']"));
    updateButtons.push(document.querySelector("[name='ctl00$mainContainer$uxTabs$ctl06$ctl00$ctl00$ctl03']"));

    for (const button of updateButtons) {
        button.addEventListener("click", () => waitToPreloadJobs());
    }

    // Add listener to jobs per page selector
    let itemPerPageSelector = <HTMLInputElement> document.querySelector("[name='ctl00$mainContainer$uxTabs$ctl06$ctl00$ctl00$uxPgSz']");
    itemPerPageSelector.addEventListener("change", () => waitToPreloadJobs());
}

/**
 * Waits for the loading indicator before preping to preload jobs
 */
async function waitToPreloadJobs() {
    await waitForLoadingIndicator();

    prepJobsListPreloader();
}

/**
 * Will preload all of the jobs on the current page in hidden Iframes.
 */
async function preloadJobs() {
    // Start scraping for the details of every job.
    let rows: NodeListOf<HTMLTableRowElement> = getJobList();

    // Remove all old links
    for (const row of rows) {
        let clickElements: Array<HTMLTableDataCellElement> = [];
        clickElements.push(<HTMLTableDataCellElement> row.querySelector("td[headers~='CoopJobNumber'] > a"));
        clickElements.push(<HTMLTableDataCellElement> row.querySelector("td[headers~='JobTitle'] > a"));

        for (const element of clickElements) {
            if (element !== null) {
                // Remove old link
                element.removeAttribute("href");
                element.classList.add("coop-navigator-improved-job-link");

                // If this is clicked, load it right away
                element.addEventListener("click", preloadIframeRightNow);
            }
        }
    }

    // Start preloading iframes
    for (const row of rows) {
        addPreloadIframe(row);

        // To give it time to load, add a little delay
        await new Promise((resolve, reject) => {
            setTimeout(resolve, 2000);
        });
    }
}

/**
 * Added to a click listener to be able to add an iframe on click
 * 
 * @param ev 
 */
function preloadIframeRightNow(ev: MouseEvent) {
    // Get the table by taking the far up parent
    addPreloadIframe(this.parentElement.parentElement, false);
}

/**
 * Adds the iframe with the preloaded job to the given row
 *
 * @param row 
 * @param jobNumberElement 
 */
function addPreloadIframe(row: HTMLTableRowElement, hidden: boolean = true): void {
    let jobNumberElement: HTMLTableDataCellElement = row.querySelector("td[headers~='CoopJobNumber'] > a");
    let id: string = "coop-navigator-improved-job-" + jobNumberElement.innerText;

    // Make sure it hasn't already been created
    if (document.getElementById(id) !== null) return;

    // The elements that can open an Iframe
    let clickElements: Array<HTMLTableDataCellElement> = [jobNumberElement];
    clickElements.push(<HTMLTableDataCellElement> row.querySelector("td[headers~='JobTitle'] > a"));

    // Remove the old listener
    for (const element of clickElements) {
        if (element !== null) {
            element.removeEventListener("click", preloadIframeRightNow);
        }
    }

    // Replace this link with a link to open a hidden Iframe
    let iframe: HTMLIFrameElement = document.createElement("iframe");
    iframe.id = id;
    iframe.setAttribute("src", document.URL + "#jobNumber=" + jobNumberElement.innerText);
    iframe.setAttribute("frameborder", "0");
    iframe.classList.add("coop-navigator-improved-job-view");

    if (hidden) iframe.classList.add("hidden");

    // Add the iframe to the document
    row.parentElement.insertBefore(iframe, jobNumberElement.parentElement.parentElement.nextElementSibling);

    // Add listener to make the Iframe visible
    for (const element of clickElements) {
        if (element !== null) {
            element.addEventListener("click", (e) => {
                if (iframe.classList.contains("hidden")) {
                    iframe.classList.remove("hidden");
                } else {
                    iframe.classList.add("hidden");
                }
            });
        }
    }
}

async function waitForLoadingIndicator() {
    let loadingStatus: HTMLDivElement = <HTMLDivElement> document.getElementById("ctl00_mainContainer_UpdateProgress1_uxUpdateProgress");

    // Wait for the loading status to appear if required
    if (loadingStatus.style.display = "none") {
        await Utils.wait(() => loadingStatus.style.display == "block");
    }

    // Wait for the loading status to disappear
    await Utils.wait(() => loadingStatus.style.display == "none");
}

/**
 * Gets the link element of this job row
 * 
 * @param row The row of this job
 */
function getJobLink(row: HTMLTableRowElement): HTMLLinkElement {
    return row.querySelector("td[headers~='CoopJobNumber'] > a");
}

/**
 * Gets the job list from the DOM
 */
function getJobList(): NodeListOf<HTMLTableRowElement> {
    return document.querySelectorAll("#ctl00_mainContainer_uxTabs_ctl05 > div > div > table.GridView > tbody > :not(.GridHeaderStyle)");
}