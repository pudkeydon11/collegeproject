const User = require('./../models/userModel');
const Otp = require('./../models/otp')
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
var jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET;
var bcrypt = require('bcryptjs');
const Email = require('./../utils/email');
const crypto = require('crypto');


//function generating jwt token
const signToken = id => {
    return jwt.sign({id : id}, 'secret', {
        expiresIn: '1h'
    });
}
const generateRandomNumber = () => {
    var randomNumber = Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000;
    return randomNumber.toString();
  };

const createSendToken = async (user, statusCode,req, res) => {
    const token = signToken(user._id)
    user.password = undefined;
    res.cookie('jwt', token, 20000);
    res.status(statusCode).json({
        status: 'success',
        token,
        id : user._id,
        data: {
            user: user
        }
    })
}

//signup middleware using jwt
exports.signup = async(req, res, next) => {
    
     
    try { 
         const otp = generateRandomNumber();
        const newUser = await User.create({
            name: req.body.name,
            email: req.body.email,
            password: req.body.password,
            passwordConfirm: req.body.passwordConfirm,
            role : req.body.role,
            addedBy : req.body.addedBy,
            number : otp 

        });
        const user = await newUser.save()
        const newotp = await Otp.create({
            email: req.body.email,
            otp: otp
        })
        await newotp.save()
        createSendToken(user, 200, req, res);
        await new Email(user).sendWelcome(otp);
    }catch(err){
        if (err.code === 11000 && err.keyPattern.email) {
            // Handle the duplicate email error
            res.json({
                status:"409",
                message:"User exists,Please choose another email"
            })
          } else {
            // Handle other errors
            console.error(err);
          }
    }

    
}

//login middleware using jwt
exports.login = catchAsync(async(req, res, next) => {
    // const email = req.body.email;
    // const password = req.body.password;
    // console.log("this is executing")
    const {email, password} = req.body
    //check if email and password exist

    if(!email || !password){
        return next(new AppError('Please provide email and password', 400));
    }
    const user = await User.findOne({email: email}).select('+password');
    if(!user){
            res.send({message:"Enter Correct email"})
    }
    if (!user.verified & user.role == 'user' ){
        res.send({message:"User not verified"})
    }
    //check if password is correct
    if(user){
        const isMatched = await bcrypt.compare(password, user.password);
        if(isMatched){
            createSendToken(user, 200, req, res);
        }
        else{
            res.send({message:"Enter Correct Password"})
        }
    }
})

//middleware to check if user is logged in 
exports.protect = catchAsync(async(req, res, next) => {
    // 1) Getting token and check of it's there
    let token;
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')){
        token = req.headers.authorization.split(' ')[1];
    }
    
    if(!token){
        return next(new AppError('You are not logged in', 401));
    }
    // 2) Verification token
    const decoded = await jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id);
    if(!user){
        return next(new AppError('User does not exist', 401));
    }
    // 4) Check if user changed password after the token was issued

    if(user.changedPasswordAfter(decoded.iat)){
        return next(new AppError('User recently changed password! Please log in again', 401));
    }
    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = user;
    next();
})

//restrictions middleware only for mentioned roles
exports.restrictTo = (...roles) => {
    /*returining the middleware function bcoz middleware doesnot work on arguments
    roles contain array new es6 feature
    getting role value from req.user previous middleware which runs before this middleware
    */
    return (req, res, next) => {
        if(!roles.includes(req.user.role)){
            return next(new AppError('You do not have permission to perform this action', 403));
        }
        next();
    }
}

//forgot password controller

