const core = require('@actions/core');
const axios = require('axios');

function circularSafeStringify(obj) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (key === '_sessionCache') return undefined;
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
}

const main = async () => {
    let status = "NOT-STARTED";
    try {
        console.log('Custom Action - GET => START');
        const instanceUrl = core.getInput('instance-url');
        const username = core.getInput('devops-integration-user-name', { required: false });
        const passwd = core.getInput('devops-integration-user-password', { required: false });
        const token = core.getInput('devops-integration-token', { required: false });
        const toolId = core.getInput('tool-id');

        let changeDetailsStr = core.getInput('change-details', { required: true });
        let githubContextStr = core.getInput('context-github', { required: true });
        core.setOutput("status", status);
        try {

            console.log('Calling Get Change Info API to get changeRequestNumber');

            let changeDetails;

            if (instanceUrl == "") {
                displayErrorMsg("Please provide a valid 'Instance Url' to proceed with Get Change Request");
                return;
            }
            if (toolId == "") {
                displayErrorMsg("Please provide a valid 'Tool Id' to proceed with Get Change Request");
                return;
            }

            try {
                changeDetails = JSON.parse(changeDetailsStr);
            } catch (e) {
                console.log(`Unable to parse Error occured with message ${e}`);
                displayErrorMsg("Failed parsing changeRequestDetails, please provide a valid JSON");
                return;
            }

            let githubContext;

            try {
                githubContext = JSON.parse(githubContextStr);
            } catch (e) {
                console.log(`Error occured with message ${e}`);
                displayErrorMsg("Exception parsing github context");
                return;
            }

            let buildNumber = changeDetails.build_number;
            let pipelineName = changeDetails.pipeline_name;
            let stageName = changeDetails.stage_name;
            let attemptNumber = changeDetails.attempt_number;

            //Checking if any input values are empty and defaulting to the current Stage, Pipeline Name, Build Number

            if (buildNumber == null || buildNumber == '')
                buildNumber = `${githubContext.run_id}` + '/attempts/' + `${githubContext.run_attempt}`;
            else
                buildNumber = buildNumber + '/attempts/' + `${githubContext.run_attempt}`;

            if (pipelineName == null || pipelineName == '')
                pipelineName = `${githubContext.repository}` + '/' + `${githubContext.workflow}`;
            if (stageName == null || stageName == '')
                stageName = `${githubContext.job}`;

            console.log("buildNumber => " + buildNumber + ", pipelineName => " + pipelineName + ", stageName => " + stageName + ", attemptNumber => " + attemptNumber);


            let restendpoint = '';
            let response;
            let httpHeaders = {};

            try {
                if (token === '' && username === '' && passwd === '') {
                    core.setFailed('Either secret token or integration username, password is needed for integration user authentication');
                    return;
                }
                else if (token !== '') {
                    restendpoint = `${instanceUrl}/api/sn_devops/v2/devops/orchestration/changeInfo?buildNumber=${buildNumber}&stageName=${stageName}&pipelineName=${pipelineName}&attemptNumber=${attemptNumber}&toolId=${toolId}`;
                    const defaultHeadersForToken = {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': 'sn_devops.DevOpsToken ' + `${toolId}:${token}`
                    };
                    httpHeaders = { headers: defaultHeadersForToken };
                }
                else if (username !== '' && passwd !== '') {
                    restendpoint = `${instanceUrl}/api/sn_devops/v1/devops/orchestration/changeInfo?buildNumber=${buildNumber}&stageName=${stageName}&pipelineName=${pipelineName}&attemptNumber=${attemptNumber}&toolId=${toolId}`;
                    const tokenBasicAuth = `${username}:${passwd}`;
                    const encodedTokenForBasicAuth = Buffer.from(tokenBasicAuth).toString('base64');

                    const defaultHeadersForBasicAuth = {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': 'Basic ' + `${encodedTokenForBasicAuth}`
                    };
                    httpHeaders = { headers: defaultHeadersForBasicAuth };
                }
                else {
                    core.setFailed('For Basic Auth, Username and Password is mandatory for integration user authentication');
                    return;
                }
                core.debug("[ServiceNow DevOps], Sending Request for Get Change, Request Header :"+JSON.stringify(httpHeaders)+"\n");
                response = await axios.get(restendpoint, httpHeaders);
                core.debug("[ServiceNow DevOps], Receiving response for Get Change, Response :"+circularSafeStringify(response)+"\n");

                if (response.data && response.data.result) {
                    status = "SUCCESS";
                    console.log('\n \x1b[1m\x1b[32m' + "change-request-number => " + response.data.result.number + '\x1b[0m\x1b[0m');
                    core.setOutput("change-request-number", response.data.result.number);
                } else {
                    status = "NOT SUCCESSFUL";
                    displayErrorMsg('No response from ServiceNow. Please check ServiceNow logs for more details.');
                }

            } catch (err) {
                status = "NOT SUCCESSFUL";
                if (!err.response) {
                    displayErrorMsg('No response from ServiceNow. Please check ServiceNow logs for more details.');
                } else {
                    status = "FAILURE";
                    if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
                        displayErrorMsg('Invalid ServiceNow Instance URL. Please correct the URL and try again.');
                    }

                    if (err.message.includes('401')) {
                        core.setFailed('Invalid Credentials. Please correct the credentials and try again.');
                    }

                    if (err.message.includes('405')) {
                        displayErrorMsg('Response Code from ServiceNow is 405. Please check ServiceNow logs for more details.');
                    }

                    if (err.response.status == 500) {
                        displayErrorMsg('Response Code from ServiceNow is 500. Please check ServiceNow logs for more details.')
                    }

                    if (err.response.status == 400 || err.response.status == 404) {
                        let errMsg = 'ServiceNow DevOps Get Change is not Successful.';
                        let errMsgSuffix = ' Please provide valid inputs.';
                        let responseData = err.response.data;
                        if (responseData && responseData.result && responseData.result.errorMessage) {
                            errMsg = errMsg + responseData.result.errorMessage + errMsgSuffix;
                            displayErrorMsg(errMsg);
                        }
                        else if (responseData && responseData.result && responseData.result.details && responseData.result.details.errors) {
                            let errors = responseData.result.details.errors;
                            for (var index in errors) {
                                errMsg = errMsg + errors[index].message + errMsgSuffix;
                            }
                            displayErrorMsg(errMsg);
                        }
                    }

                }
                core.setOutput("status", status);
            }

        } catch (err) {
            core.setOutput("status", status);
            core.setFailed(err.message);
        }

    } catch (error) {
        core.setOutput("status", status);
        core.setFailed(error.message);
    }
    core.setOutput("status", status);
}
function displayErrorMsg(errMsg) {

    console.error('\n\x1b[31m' + errMsg + '\x1b[31m');
    core.setFailed(errMsg);
}

main();
