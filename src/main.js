const core = require('@actions/core');
const axios = require('axios');

const main = async() => {
   let status = "NOT-STARTED";
   try{
    console.log('Custom Action - GET => START');    
    const instanceUrl = core.getInput('instance-url', { required: true });
    const username = core.getInput('devops-integration-user-name', { required: true });
    const passwd = core.getInput('devops-integration-user-password', { required: true });
    const toolId = core.getInput('tool-id', { required: true });
    let changeDetailsStr = core.getInput('change-details', { required: true });
    let githubContextStr = core.getInput('context-github', { required: true });
    core.setOutput("status",status);
    try{

        console.log('Calling Get Change Info API to get changeRequestNumber'); 
    
        let changeDetails;



        if(instanceUrl == ""){
            console.error("Please Provide a valid 'Instance Url' to proceed with Update Change Request"); 
            return;
        }
        if(passwd == ""){
            console.error("Please Provide a valid 'Password' to proceed with Update Change Request"); 
            return;
        }
        if(username == ""){
            console.error("Please Provide a valid 'User Name' to proceed with Update Change Request"); 
            return;
        }
        if(toolId == ""){
            console.error("Please Provide a valid 'Tool ID' to proceed with Update Change Request"); 
            return;
        }
    
        try {
          changeDetails = JSON.parse(changeDetailsStr);
        } catch (e) {
            console.log(`Unable to parse Error occured with message ${e}`);
            console.error("Failed parsing changeRequestDetails, please provide a valid JSON");
            return;
        }

        let githubContext;
    
        try {
            githubContext = JSON.parse(githubContextStr);
        } catch (e) {
            console.log(`Error occured with message ${e}`);
            console.error("Exception parsing github context");
            return;
        } 

        let buildNumber = changeDetails.build_number;
        let pipelineName = changeDetails.pipeline_name;
        let stageName = changeDetails.stage_name;
        
        //Checking if any input values are empty and defaulting to the current Stage, Pipeline Name, Build Number
        
        if(buildNumber == null || buildNumber == '')
            buildNumber = `${githubContext.run_id}`+'/attempts/'+`${githubContext.run_attempt}`;
        if(pipelineName == null || pipelineName == '')
            pipelineName = `${githubContext.repository}` + '/' + `${githubContext.workflow}`;
        if(stageName == null || stageName == '')
            stageName = `${githubContext.job}`;
        
        console.log("buildNumber => "+buildNumber+", pipelineName => "+pipelineName+", stageName => "+stageName);
    
       
        const restendpoint = `${instanceUrl}/api/sn_devops/v1/devops/orchestration/changeInfo?buildNumber=${buildNumber}&stageName=${stageName}&pipelineName=${pipelineName}&toolId=${toolId}`;
        let response;
    
        try {
            const token = `${username}:${passwd}`;
            const encodedToken = Buffer.from(token).toString('base64');
    
            const defaultHeaders = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Basic ' + `${encodedToken}`
            };
            let httpHeaders = { headers: defaultHeaders };
            response = await axios.get(restendpoint, httpHeaders);

            if(response.data && response.data.result){
                status = "SUCCESS";
                console.log("change-request-number => "+response.data.result.number);
                core.setOutput("change-request-number",response.data.result.number);
            }else{
                status = "NOT SUCCESSFUL";
                console.error('No response from ServiceNow. Please check ServiceNow logs for more details.');
            }
            
        } catch (err) {
            status = "NOT SUCCESSFUL";
            if (!err.response) {
                console.error('No response from ServiceNow. Please check ServiceNow logs for more details.');
            }else{
                status = "FAILURE";
                if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
                    console.error('Invalid ServiceNow Instance URL. Please correct the URL and try again.');
                }
                
                if (err.message.includes('401')) {
                    console.error('Invalid Credentials. Please correct the credentials and try again.');
                }
                    
                if (err.message.includes('405')) {
                    console.error('Response Code from ServiceNow is 405. Please check ServiceNow logs for more details.');
                }
            
                if (err.response.status == 500) {
                    console.error('Response Code from ServiceNow is 500. Please check ServiceNow logs for more details.')
                }
                
                if (err.response.status == 400) {
                    let errMsg = 'ServiceNow DevOps Update Change is not Succesful.';
                    let errMsgSuffix = ' Please provide valid inputs.';
                    let responseData = err.response.data;
                    if (responseData && responseData.error && responseData.error.message) {
                        errMsg = errMsg + responseData.error.message + errMsgSuffix;                        
                    } else if (responseData && responseData.result && responseData.result.details && responseData.result.details.errors) {
                        let errors = err.response.data.result.details.errors;
                        for (var index in errors) {
                            errMsg = errMsg + errors[index].message + errMsgSuffix;
                        }
                    }
                    console.error(errMsg);
                }
            }
            core.setOutput("status",status);
        }

    }catch(err){
        core.setOutput("status",status);
        core.setFailed(err.message);
    }

   }catch(error){
        core.setOutput("status",status);
       core.setFailed(error.message)
   }
   core.setOutput("status",status);
}

main();